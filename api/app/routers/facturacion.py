import csv
import io
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import defaults
from ..db import SessionLocal, get_db
from ..models import Descuento, Factura, RegistroFacturacion, Trabajo, Usuario
from ..schemas import (AnularIn, DescuentoIn, DescuentoOut, FacturaIn, FacturaOut, RectificarIn, RegistroOut)
from ..security import solo_admin, solo_gestion, usuario_actual
from ..services import facturacion as fac
from ..services import verifactu
from ..services.fiscal import _fusionar, config_fiscal, descuento_vigente, desglose_por_tipo
from ..services.pdf import generar_factura
from .ajustes import obtener

router = APIRouter(tags=["facturación"])
MODOS = {"desactivado", "preparado", "pruebas", "produccion"}


def _cfg(db: Session) -> dict:
    return config_fiscal(obtener(db))


# ------------------------------------------------------------------ configuración fiscal
@router.get("/facturacion/config", dependencies=[Depends(solo_gestion)])
def leer_config(db: Session = Depends(get_db)):
    cfg = _cfg(db)
    hay_facturas = db.scalar(select(Factura.id).limit(1)) is not None
    return {**cfg, "bloqueado": {"emisor_nif": hay_facturas}, "por_defecto": defaults.FACTURACION}


@router.put("/facturacion/config", dependencies=[Depends(solo_admin)])
def guardar_config(datos: dict, db: Session = Depends(get_db)):
    datos = {k: v for k, v in datos.items() if k in defaults.FACTURACION}
    a = obtener(db)
    actual = config_fiscal(a)
    nuevo = _fusionar(actual, datos)
    if db.scalar(select(Factura.id).limit(1)) is not None and nuevo["emisor"]["nif"] != actual["emisor"]["nif"]:
        raise HTTPException(409, "Ya hay facturas emitidas con este NIF: no se puede cambiar")
    if nuevo["verifactu"]["modo"] not in MODOS:
        raise HTTPException(422, "Modo VERI*FACTU no válido")
    if actual["verifactu"]["modo"] in verifactu.ENVIA and nuevo["verifactu"]["modo"] not in verifactu.ENVIA:
        raise HTTPException(409, "Una vez enviando a la AEAT no se puede volver a un modo sin envío")
    for k, v in nuevo["iva"].items():
        if not isinstance(v, int) or not 0 <= v <= 2100:
            raise HTTPException(422, f"Tipo de IVA no válido para {k}")
    a.facturacion = nuevo
    db.commit()
    return nuevo


# ------------------------------------------------------------------ descuentos
@router.get("/descuentos", response_model=list[DescuentoOut])
def descuentos(todos: bool = False, db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    lista = db.scalars(select(Descuento).order_by(Descuento.nombre)).all()
    if todos and user.rol.value in ("admin", "encargado"):
        return lista
    hoy = fac.hoy_madrid()
    return [d for d in lista if descuento_vigente(d, hoy)]


@router.post("/descuentos", response_model=DescuentoOut, dependencies=[Depends(solo_gestion)])
def crear_descuento(d: DescuentoIn, db: Session = Depends(get_db)):
    if d.tipo == "porcentaje" and d.valor > 100:
        raise HTTPException(422, "Un porcentaje no puede pasar de 100")
    obj = Descuento(**d.model_dump())
    db.add(obj)
    db.commit()
    return obj


@router.put("/descuentos/{did}", response_model=DescuentoOut, dependencies=[Depends(solo_gestion)])
def editar_descuento(did: int, d: DescuentoIn, db: Session = Depends(get_db)):
    obj = db.get(Descuento, did) or _404()
    for k, v in d.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    return obj


# ------------------------------------------------------------------ facturas
def _out(db: Session, f: Factura, cfg: dict) -> FacturaOut:
    o = FacturaOut.model_validate(f)
    o.verifactu = fac.info_verifactu(db, f, cfg)
    return o


@router.get("/facturas", response_model=list[FacturaOut])
def listar(desde: date | None = None, hasta: date | None = None, tienda_id: int | None = None,
           tipo: str | None = None, q: str | None = None, limit: int = 200,
           db: Session = Depends(get_db), user: Usuario = Depends(solo_gestion)):
    stmt = select(Factura).order_by(Factura.fecha_expedicion.desc(), Factura.id.desc()).limit(min(limit, 1000))
    if desde:
        stmt = stmt.where(Factura.fecha_expedicion >= desde)
    if hasta:
        stmt = stmt.where(Factura.fecha_expedicion <= hasta)
    if tienda_id:
        stmt = stmt.where(Factura.tienda_id == tienda_id)
    if tipo:
        stmt = stmt.where(Factura.tipo.startswith(tipo))
    if q:
        stmt = stmt.where(Factura.num_serie.ilike(f"%{q}%"))
    cfg = _cfg(db)
    return [_out(db, f, cfg) for f in db.scalars(stmt)]


@router.get("/facturas/{fid}", response_model=FacturaOut)
def leer(fid: int, db: Session = Depends(get_db), user: Usuario = Depends(solo_gestion)):
    return _out(db, db.get(Factura, fid) or _404(), _cfg(db))


def _envio_en_segundo_plano(tareas: BackgroundTasks, cfg: dict) -> None:
    vf = cfg["verifactu"]
    if vf.get("envio_automatico") and vf["modo"] in verifactu.ENVIA:
        def tarea():
            db = SessionLocal()
            try:
                verifactu.enviar_pendientes(db, cfg)
            finally:
                db.close()
        tareas.add_task(tarea)


@router.post("/facturas", response_model=FacturaOut)
def emitir(datos: FacturaIn, tareas: BackgroundTasks, db: Session = Depends(get_db),
           user: Usuario = Depends(solo_gestion)):
    cfg = _cfg(db)
    f = fac.emitir(db, cfg, user, datos)
    _envio_en_segundo_plano(tareas, cfg)
    return _out(db, f, cfg)


@router.post("/facturas/{fid}/rectificar", response_model=FacturaOut)
def rectificar(fid: int, datos: RectificarIn, tareas: BackgroundTasks, db: Session = Depends(get_db),
               user: Usuario = Depends(solo_gestion)):
    cfg = _cfg(db)
    original = db.get(Factura, fid) or _404()
    f = fac.rectificar(db, cfg, user, original, datos)
    _envio_en_segundo_plano(tareas, cfg)
    return _out(db, f, cfg)


@router.post("/facturas/{fid}/anular", response_model=FacturaOut, dependencies=[Depends(solo_admin)])
def anular(fid: int, datos: AnularIn, tareas: BackgroundTasks, db: Session = Depends(get_db)):
    cfg = _cfg(db)
    f = fac.anular(db, cfg, db.get(Factura, fid) or _404(), datos.motivo)
    _envio_en_segundo_plano(tareas, cfg)
    return _out(db, f, cfg)


@router.get("/facturas/{fid}/pdf", dependencies=[Depends(solo_gestion)])
def pdf(fid: int, db: Session = Depends(get_db)):
    f = db.get(Factura, fid) or _404()
    cfg = _cfg(db)
    orig = db.get(Factura, f.rectificada_id).num_serie if f.rectificada_id else None
    datos = generar_factura(f, obtener(db).nombre_estudio, verifactu.url_qr(f, f.modo_verifactu), orig, cfg.get("texto_pie", ""))
    return Response(datos, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{f.num_serie}.pdf"'})


@router.get("/facturas/{fid}/xml", dependencies=[Depends(solo_admin)])
def xml(fid: int, db: Session = Depends(get_db)):
    """XML de los registros VERI*FACTU de la factura (para revisión o envío manual)."""
    regs = db.scalars(select(RegistroFacturacion).where(RegistroFacturacion.factura_id == fid)
                      .order_by(RegistroFacturacion.id)).all()
    if not regs:
        raise HTTPException(404, "La factura no tiene registros de facturación")
    return Response(verifactu.sobre_soap(db, regs, _cfg(db)), media_type="application/xml")


# ------------------------------------------------------------------ IVA y libro registro
def _facturas_periodo(db: Session, desde: date, hasta: date, tienda_id: int | None):
    stmt = select(Factura).where(Factura.fecha_expedicion >= desde, Factura.fecha_expedicion <= hasta,
                                 Factura.estado != "anulada").order_by(Factura.fecha_expedicion, Factura.serie, Factura.numero)
    if tienda_id:
        stmt = stmt.where(Factura.tienda_id == tienda_id)
    return db.scalars(stmt).all()


@router.get("/facturacion/iva", dependencies=[Depends(solo_gestion)])
def resumen_iva(desde: date, hasta: date, tienda_id: int | None = None, db: Session = Depends(get_db)):
    """IVA repercutido del periodo (base del modelo 303) y lo cobrado que aún no tiene factura."""
    facturas = _facturas_periodo(db, desde, hasta, tienda_id)
    grupos: dict[int, dict] = {}
    for f in facturas:
        for g in f.desglose:
            x = grupos.setdefault(g["iva_x100"], {"iva_x100": g["iva_x100"], "base_cent": 0, "cuota_cent": 0})
            x["base_cent"] += g["base_cent"]
            x["cuota_cent"] += g["cuota_cent"]
    q = select(Trabajo).where(Trabajo.fecha >= desde, Trabajo.fecha <= hasta, Trabajo.factura_id.is_(None))
    if tienda_id:
        q = q.where(Trabajo.tienda_id == tienda_id)
    sin = db.scalars(q).all()
    return {
        "desde": desde.isoformat(), "hasta": hasta.isoformat(),
        "facturas": len(facturas),
        "por_tipo_factura": {t: sum(1 for f in facturas if f.tipo == t) for t in sorted({f.tipo for f in facturas})},
        "desglose": sorted(grupos.values(), key=lambda g: -g["iva_x100"]),
        "base_cent": sum(g["base_cent"] for g in grupos.values()),
        "cuota_cent": sum(g["cuota_cent"] for g in grupos.values()),
        "total_cent": sum(f.total_cent for f in facturas),
        "sin_factura": {"trabajos": len(sin), "total_cent": sum(t.importe_cent for t in sin),
                        "desglose": desglose_por_tipo([(t.importe_cent, t.iva_x100 or 2100) for t in sin])},
    }


@router.get("/facturacion/libro.csv", dependencies=[Depends(solo_gestion)])
def libro(desde: date, hasta: date, tienda_id: int | None = None, db: Session = Depends(get_db)):
    """Libro registro de facturas expedidas (una fila por factura y tipo de IVA). Se abre en Excel."""
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Fecha expedición", "Fecha operación", "Número", "Tipo", "Rectifica a", "Cliente", "NIF cliente",
                "Base imponible", "Tipo IVA %", "Cuota IVA", "Total factura", "Estado"])
    for f in _facturas_periodo(db, desde, hasta, tienda_id):
        orig = db.get(Factura, f.rectificada_id).num_serie if f.rectificada_id else ""
        d = f.destinatario or {}
        for i, g in enumerate(f.desglose):
            w.writerow([f.fecha_expedicion.strftime("%d/%m/%Y"),
                        (f.fecha_operacion or f.fecha_expedicion).strftime("%d/%m/%Y"), f.num_serie, f.tipo, orig,
                        d.get("nombre", ""), d.get("nif", ""), _c(g["base_cent"]), f"{g['iva_x100'] / 100:g}".replace(".", ","),
                        _c(g["cuota_cent"]), _c(f.total_cent) if i == 0 else "", f.estado])
    return StreamingResponse(iter(["﻿" + buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename=libro_facturas_{desde}_{hasta}.csv"})


def _c(cent: int) -> str:
    return f"{cent / 100:.2f}".replace(".", ",")


# ------------------------------------------------------------------ VERI*FACTU
@router.get("/verifactu/registros", response_model=list[RegistroOut], dependencies=[Depends(solo_admin)])
def registros(estado: str | None = None, limit: int = 200, db: Session = Depends(get_db)):
    q = select(RegistroFacturacion).order_by(RegistroFacturacion.id.desc()).limit(min(limit, 1000))
    if estado:
        q = q.where(RegistroFacturacion.estado_envio == estado)
    return db.scalars(q).all()


@router.get("/verifactu/estado", dependencies=[Depends(solo_admin)])
def estado(db: Session = Depends(get_db)):
    cfg = _cfg(db)
    nif = (cfg["emisor"].get("nif") or "").upper()
    cuenta = {}
    for (e,) in db.execute(select(RegistroFacturacion.estado_envio)):
        cuenta[e] = cuenta.get(e, 0) + 1
    return {"modo": cfg["verifactu"]["modo"], "registros": cuenta,
            "cadena": verifactu.verificar_cadena(db, nif) if nif else None,
            "listo_para_enviar": bool(cfg["verifactu"].get("certificado_pfx"))
            and all(cfg["verifactu"]["sistema"].get(k) for k in ("nombre_razon", "nif"))}


@router.post("/verifactu/enviar", dependencies=[Depends(solo_admin)])
def enviar(db: Session = Depends(get_db)):
    return verifactu.enviar_pendientes(db, _cfg(db))


def _404():
    raise HTTPException(404, "No encontrado")
