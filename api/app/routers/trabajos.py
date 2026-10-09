import uuid
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Descuento, Trabajo, Usuario
from ..schemas import TrabajoIn, TrabajoOut
from ..security import es_gestion, usuario_actual
from ..services.caja import dia_cerrado
from ..services.comisiones import reparto_completo
from ..services.fiscal import calcular_descuento, config_fiscal, descuento_vigente
from .ajustes import obtener

router = APIRouter(prefix="/trabajos", tags=["trabajos"])
FOTOS_OK = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


@router.get("", response_model=list[TrabajoOut])
def listar(desde: date | None = None, hasta: date | None = None, tienda_id: int | None = None,
           usuario_id: int | None = None, sin_factura: bool = False, cliente_id: int | None = None,
           db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    q = select(Trabajo).order_by(Trabajo.fecha.desc(), Trabajo.id.desc())
    if sin_factura:
        q = q.where(Trabajo.factura_id.is_(None))
    if cliente_id:
        q = q.where(Trabajo.cliente_id == cliente_id)
    if desde:
        q = q.where(Trabajo.fecha >= desde)
    if hasta:
        q = q.where(Trabajo.fecha <= hasta)
    if tienda_id:
        q = q.where(Trabajo.tienda_id == tienda_id)
    if not es_gestion(user):
        usuario_id = user.id
    if usuario_id:
        q = q.where(Trabajo.usuario_id == usuario_id)
    return db.scalars(q).all()


@router.post("", response_model=TrabajoOut)
def registrar(t: TrabajoIn, db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    profesional_id = t.usuario_id or user.id
    if profesional_id != user.id and not es_gestion(user):
        raise HTTPException(403, "Solo puedes registrar tus trabajos")
    profesional = db.get(Usuario, profesional_id)
    if not profesional:
        raise HTTPException(404, "Profesional no encontrado")
    fecha = t.fecha or date.today()
    if dia_cerrado(db, t.tienda_id, fecha):
        raise HTTPException(409, "La caja de ese día ya está cerrada")
    cfg = config_fiscal(obtener(db))
    precio = t.precio_cent or t.importe_cent
    if not precio:
        raise HTTPException(422, "Falta el precio")

    # Descuento: predefinido, porcentaje o importe a mano
    desc_obj = None
    if t.descuento_id:
        desc_obj = db.get(Descuento, t.descuento_id)
        if not desc_obj or not descuento_vigente(desc_obj, fecha):
            raise HTTPException(422, "Ese descuento no existe o no está vigente")
        if desc_obj.solo_gestion and not es_gestion(user):
            raise HTTPException(403, "Ese descuento solo lo puede aplicar recepción o administración")
    descuento = calcular_descuento(precio, descuento=desc_obj, pct=t.descuento_pct, importe_cent=t.descuento_cent)
    if descuento and not es_gestion(user) and descuento * 100 > precio * cfg["descuento_max_pct"]:
        raise HTTPException(403, f"El descuento máximo sin autorización es del {cfg['descuento_max_pct']} %")
    if descuento >= precio:
        raise HTTPException(422, "El descuento no puede ser igual o mayor que el precio")
    if descuento and not (desc_obj or t.descuento_motivo):
        raise HTTPException(422, "Indica el motivo del descuento")

    try:
        r = reparto_completo(db, cfg, profesional, t.tipo_servicio, t.tienda_id, precio - descuento)
    except ValueError as e:
        raise HTTPException(422, str(e))
    datos = t.model_dump(exclude={"usuario_id", "fecha", "importe_cent", "precio_cent", "descuento_id",
                                  "descuento_pct", "descuento_cent", "descuento_motivo"})
    obj = Trabajo(**datos, usuario_id=profesional_id, fecha=fecha, precio_cent=precio, descuento_cent=descuento,
                  descuento_id=desc_obj.id if desc_obj else None,
                  descuento_motivo=desc_obj.nombre if desc_obj else (t.descuento_motivo if descuento else None),
                  importe_cent=r["total_cent"], porcentaje=r["porcentaje"], profesional_cent=r["profesional_cent"],
                  estudio_cent=r["estudio_cent"], iva_x100=r["iva_x100"], base_cent=r["base_cent"],
                  cuota_iva_cent=r["cuota_iva_cent"])
    db.add(obj)
    db.commit()
    return obj


@router.post("/{tid}/foto", response_model=TrabajoOut)
async def subir_foto(tid: int, foto: UploadFile = File(...), db: Session = Depends(get_db),
                     user: Usuario = Depends(usuario_actual)):
    obj = db.get(Trabajo, tid)
    if not obj:
        raise HTTPException(404, "Trabajo no encontrado")
    if obj.usuario_id != user.id and not es_gestion(user):
        raise HTTPException(403, "No es tu trabajo")
    ext = FOTOS_OK.get(foto.content_type or "")
    if not ext:
        raise HTTPException(415, "Formato no admitido (jpg, png, webp)")
    datos = await foto.read()
    if len(datos) > 15 * 1024 * 1024:
        raise HTTPException(413, "La foto supera 15 MB")
    carpeta = Path(settings.media_dir) / "trabajos"
    carpeta.mkdir(parents=True, exist_ok=True)
    nombre = f"{tid}-{uuid.uuid4().hex[:8]}{ext}"
    (carpeta / nombre).write_bytes(datos)
    obj.foto_url = f"/media/trabajos/{nombre}"
    db.commit()
    return obj


@router.patch("/{tid}/portfolio", response_model=TrabajoOut)
def portfolio(tid: int, publicar: bool, db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    obj = db.get(Trabajo, tid)
    if not obj:
        raise HTTPException(404, "Trabajo no encontrado")
    if obj.usuario_id != user.id and not es_gestion(user):
        raise HTTPException(403, "No es tu trabajo")
    if publicar and not obj.foto_url:
        raise HTTPException(422, "El trabajo no tiene foto")
    obj.en_portfolio = publicar
    db.commit()
    return obj


@router.delete("/{tid}", status_code=204)
def borrar(tid: int, db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    obj = db.get(Trabajo, tid)
    if not obj:
        raise HTTPException(404, "Trabajo no encontrado")
    if not es_gestion(user):
        raise HTTPException(403, "Solo gestión puede anular trabajos")
    if dia_cerrado(db, obj.tienda_id, obj.fecha):
        raise HTTPException(409, "La caja de ese día ya está cerrada")
    if obj.factura_id:
        raise HTTPException(409, "Este trabajo ya está facturado: corrige con una factura rectificativa")
    db.delete(obj)
    db.commit()
