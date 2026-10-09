"""Emisión de facturas: completas (F1), simplificadas/tickets (F2), rectificativas (R1-R5) y anulaciones.

Reglas que se aplican aquí:
  - Numeración correlativa por serie (serie = tipo + tienda + año), sin huecos: el contador se bloquea al emitir.
  - Una factura emitida no se modifica ni se borra. Se corrige con rectificativa o, si no debió emitirse, se anula.
  - Cada alta y cada anulación genera su registro de facturación encadenado (VERI*FACTU).
"""
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (Cliente, ContadorSerie, Factura, FacturaLinea, RegistroFacturacion, Tienda, Trabajo, TipoServicio,
                      Usuario)
from ..schemas import FacturaIn, LineaLibre, RectificarIn
from . import nif as nifs
from . import verifactu
from .fiscal import desglosar, desglose_por_tipo

SERVICIO_TXT = {"tatuaje": "Servicio de tatuaje", "piercing": "Servicio de piercing", "producto": "Venta de producto"}


def hoy_madrid() -> date:
    return datetime.now(verifactu.HUSO).date()


def comprobar_emisor(cfg: dict) -> dict:
    em = cfg["emisor"]
    faltan = [k for k in ("nif", "razon_social", "domicilio") if not (em.get(k) or "").strip()]
    if faltan:
        raise HTTPException(422, "Completa los datos fiscales del estudio antes de facturar: " + ", ".join(faltan))
    if not nifs.valido(em["nif"]):
        raise HTTPException(422, "El NIF del estudio no es válido")
    return {**em, "nif": nifs.normalizar(em["nif"])}


def _serie(db: Session, cfg: dict, tipo: str, tienda: Tienda, fecha: date) -> tuple[str, int]:
    pref_tipo = cfg["series"]["R" if tipo.startswith("R") else tipo]
    pref_tienda = cfg["prefijo_tienda"].get(str(tienda.id)) or (tienda.slug or tienda.nombre or "X")[0].upper()
    serie = f"{pref_tipo}{pref_tienda}{fecha:%y}"
    c = db.execute(select(ContadorSerie).where(ContadorSerie.serie == serie).with_for_update()).scalar_one_or_none()
    if not c:
        c = ContadorSerie(serie=serie, ultimo=0)
        db.add(c)
    c.ultimo += 1
    db.flush()
    return serie, c.ultimo


def _destinatario(d, tipo: str) -> dict | None:
    if not d:
        if tipo in ("F1", "R1", "R2", "R3", "R4"):
            raise HTTPException(422, "La factura completa necesita nombre y NIF del cliente")
        return None
    out = d.model_dump()
    pais = (out.get("pais") or "ES").upper()
    out["pais"] = pais
    if out.get("nif"):
        if pais == "ES":
            if not nifs.valido(out["nif"]):
                raise HTTPException(422, "El NIF del cliente no es válido")
            out["nif"] = nifs.normalizar(out["nif"])
    elif tipo in ("F1", "R1", "R2", "R3", "R4"):
        raise HTTPException(422, "La factura completa necesita el NIF (o pasaporte si es extranjero) del cliente")
    if tipo == "F1" and not out.get("domicilio"):
        raise HTTPException(422, "La factura completa necesita el domicilio del cliente")
    return out


def _linea_libre(l: LineaLibre, cfg: dict, signo: int = 1) -> FacturaLinea:
    iva = l.iva_x100 if l.iva_x100 is not None else cfg["iva"].get(l.tipo_servicio.value if l.tipo_servicio else "producto", 2100)
    total = (l.precio_cent * l.cantidad - l.descuento_cent) * signo
    if not cfg.get("precios_con_iva", True):
        base, cuota = desglosar(total, iva, False)
        total = base + cuota
    base, cuota = desglosar(total, iva)
    return FacturaLinea(descripcion=l.descripcion, cantidad=l.cantidad, precio_cent=l.precio_cent * signo,
                        descuento_cent=l.descuento_cent * signo, iva_x100=iva, base_cent=base, cuota_cent=cuota,
                        total_cent=total)


def _cerrar_importes(f: Factura, lineas: list[FacturaLinea]) -> None:
    f.desglose = desglose_por_tipo([(l.total_cent, l.iva_x100) for l in lineas])
    f.base_cent = sum(g["base_cent"] for g in f.desglose)
    f.cuota_cent = sum(g["cuota_cent"] for g in f.desglose)
    f.total_cent = f.base_cent + f.cuota_cent


def _crear(db: Session, cfg: dict, user: Usuario, tipo: str, tienda: Tienda, lineas: list[FacturaLinea], **campos) -> Factura:
    if not lineas:
        raise HTTPException(422, "La factura no tiene líneas")
    emisor = comprobar_emisor(cfg)
    fecha = hoy_madrid()
    serie, numero = _serie(db, cfg, tipo, tienda, fecha)
    modo = cfg["verifactu"]["modo"]
    f = Factura(tienda_id=tienda.id, tipo=tipo, serie=serie, numero=numero, num_serie=f"{serie}-{numero:05d}",
                fecha_expedicion=fecha, emisor=emisor, creado_por=user.id, modo_verifactu=modo, **campos)
    _cerrar_importes(f, lineas)
    db.add(f)
    db.flush()
    for l in lineas:
        l.factura_id = f.id
        db.add(l)
    if modo != "desactivado":
        verifactu.registrar(db, f, "alta", modo)
    return f


def emitir(db: Session, cfg: dict, user: Usuario, datos: FacturaIn) -> Factura:
    tienda = db.get(Tienda, datos.tienda_id)
    if not tienda:
        raise HTTPException(404, "Estudio no encontrado")
    lineas: list[FacturaLinea] = []
    trabajos = []
    if datos.trabajo_ids:
        trabajos = db.scalars(select(Trabajo).where(Trabajo.id.in_(datos.trabajo_ids)).with_for_update(of=Trabajo)).all()
        if len(trabajos) != len(set(datos.trabajo_ids)):
            raise HTTPException(404, "Algún trabajo no existe")
        for t in trabajos:
            if t.factura_id:
                raise HTTPException(409, f"El trabajo {t.id} ya está facturado")
            if t.tienda_id != tienda.id:
                raise HTTPException(422, "Todos los trabajos deben ser del mismo estudio")
            precio = t.precio_cent or t.importe_cent
            desc = t.descripcion or SERVICIO_TXT[t.tipo_servicio.value]
            if t.descuento_cent:
                desc += f" (dto. {t.descuento_motivo or ''})".replace(" ()", "")
            lineas.append(FacturaLinea(trabajo_id=t.id, descripcion=desc[:250], cantidad=1, precio_cent=precio,
                                       descuento_cent=t.descuento_cent or 0, iva_x100=t.iva_x100,
                                       base_cent=t.base_cent, cuota_cent=t.cuota_iva_cent, total_cent=t.importe_cent))
    for l in datos.lineas:
        if l.precio_cent <= 0:
            raise HTTPException(422, "El precio de cada línea debe ser positivo")
        lineas.append(_linea_libre(l, cfg))

    total = sum(l.total_cent for l in lineas)
    if datos.tipo == "F2" and total > cfg["limite_simplificada_cent"]:
        raise HTTPException(422, f"Más de {cfg['limite_simplificada_cent'] // 100} €: hay que emitir factura completa con los datos del cliente")
    destinatario = _destinatario(datos.destinatario, datos.tipo)
    cliente_id = datos.cliente_id or next((t.cliente_id for t in trabajos if t.cliente_id), None)
    if not destinatario and cliente_id:
        c = db.get(Cliente, cliente_id)
        destinatario = {"nombre": c.nombre} if c else None
    fechas = [t.fecha for t in trabajos]
    pago = datos.forma_pago.value if datos.forma_pago else (trabajos[0].forma_pago.value if trabajos else None)
    descripcion = datos.descripcion or ", ".join(dict.fromkeys(SERVICIO_TXT[t.tipo_servicio.value] for t in trabajos)) \
        or lineas[0].descripcion
    f = _crear(db, cfg, user, datos.tipo, tienda, lineas, destinatario=destinatario, cliente_id=cliente_id,
               descripcion=descripcion[:500], forma_pago=pago,
               fecha_operacion=max(fechas) if fechas else datos.fecha_operacion)
    for t in trabajos:
        t.factura_id = f.id
    db.commit()
    return f


def rectificar(db: Session, cfg: dict, user: Usuario, original: Factura, datos: RectificarIn) -> Factura:
    if original.estado == "anulada":
        raise HTTPException(409, "No se puede rectificar una factura anulada")
    if original.tipo.startswith("R"):
        raise HTTPException(422, "Rectifica la factura original, no la rectificativa")
    tipo = datos.tipo or ("R5" if original.tipo == "F2" else "R4")
    if original.tipo == "F2" and tipo != "R5":
        raise HTTPException(422, "Una simplificada se rectifica con R5")
    if original.tipo == "F1" and tipo == "R5":
        raise HTTPException(422, "R5 es solo para simplificadas")
    if datos.total:
        lineas = [FacturaLinea(trabajo_id=l.trabajo_id, descripcion=f"Rectifica: {l.descripcion}"[:250],
                               cantidad=l.cantidad, precio_cent=-l.precio_cent, descuento_cent=-l.descuento_cent,
                               iva_x100=l.iva_x100, base_cent=-l.base_cent, cuota_cent=-l.cuota_cent,
                               total_cent=-l.total_cent) for l in original.lineas]
    else:
        if not datos.lineas:
            raise HTTPException(422, "Indica las líneas de la rectificación")
        lineas = [_linea_libre(l, cfg) for l in datos.lineas]
    destinatario = _destinatario(datos.destinatario, tipo) if datos.destinatario else original.destinatario
    if tipo != "R5" and not (destinatario or {}).get("nif"):
        raise HTTPException(422, "La rectificativa de una factura completa necesita el NIF del cliente")
    tienda = db.get(Tienda, original.tienda_id)
    f = _crear(db, cfg, user, tipo, tienda, lineas, destinatario=destinatario, cliente_id=original.cliente_id,
               descripcion=f"Rectificación de {original.num_serie}: {datos.motivo}"[:500],
               forma_pago=original.forma_pago, rectificada_id=original.id, tipo_rectificacion="I",
               motivo=datos.motivo, fecha_operacion=original.fecha_operacion)
    original.estado = "rectificada"
    db.commit()
    return f


def anular(db: Session, cfg: dict, original: Factura, motivo: str) -> Factura:
    """Para facturas que no debieron emitirse (duplicada, cliente equivocado...). Libera los trabajos."""
    if original.estado == "anulada":
        raise HTTPException(409, "Ya está anulada")
    if db.scalar(select(Factura.id).where(Factura.rectificada_id == original.id)):
        raise HTTPException(409, "Tiene rectificativas: no se puede anular")
    modo = cfg["verifactu"]["modo"]
    if modo != "desactivado":
        verifactu.registrar(db, original, "anulacion", modo)
    original.estado = "anulada"
    original.motivo = motivo
    for t in db.scalars(select(Trabajo).where(Trabajo.factura_id == original.id)):
        t.factura_id = None
    db.commit()
    return original


def info_verifactu(db: Session, f: Factura, cfg: dict) -> dict:
    regs = db.scalars(select(RegistroFacturacion).where(RegistroFacturacion.factura_id == f.id)
                      .order_by(RegistroFacturacion.id)).all()
    return {"modo": f.modo_verifactu, "qr": verifactu.url_qr(f, f.modo_verifactu),
            "registros": [{"tipo": r.tipo, "huella": r.huella, "estado_envio": r.estado_envio, "csv": r.csv_aeat}
                          for r in regs]}
