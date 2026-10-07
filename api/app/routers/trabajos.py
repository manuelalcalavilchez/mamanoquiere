import uuid
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Trabajo, Usuario
from ..schemas import TrabajoIn, TrabajoOut
from ..security import es_gestion, usuario_actual
from ..services.caja import dia_cerrado
from ..services.comisiones import porcentaje_para, repartir

router = APIRouter(prefix="/trabajos", tags=["trabajos"])
FOTOS_OK = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


@router.get("", response_model=list[TrabajoOut])
def listar(desde: date | None = None, hasta: date | None = None, tienda_id: int | None = None,
           usuario_id: int | None = None, db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    q = select(Trabajo).order_by(Trabajo.fecha.desc(), Trabajo.id.desc())
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
    try:
        pct = porcentaje_para(db, profesional, t.tipo_servicio, t.tienda_id)
    except ValueError as e:
        raise HTTPException(422, str(e))
    prof, est = repartir(t.importe_cent, pct)
    obj = Trabajo(**t.model_dump(exclude={"usuario_id", "fecha"}), usuario_id=profesional_id, fecha=fecha,
                  porcentaje=pct, profesional_cent=prof, estudio_cent=est)
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
    db.delete(obj)
    db.commit()
