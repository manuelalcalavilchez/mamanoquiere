from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Cita, EstadoCita, Usuario
from ..schemas import CitaIn, CitaOut, CitaUpd
from ..security import es_gestion, usuario_actual

router = APIRouter(prefix="/citas", tags=["agenda"])


@router.get("", response_model=list[CitaOut])
def agenda(desde: date, hasta: date | None = None, tienda_id: int | None = None, usuario_id: int | None = None,
           db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    hasta = hasta or desde
    q = select(Cita).where(Cita.inicio >= datetime.combine(desde, time.min),
                           Cita.inicio < datetime.combine(hasta + timedelta(days=1), time.min),
                           Cita.estado != EstadoCita.cancelada).order_by(Cita.inicio)
    if tienda_id:
        q = q.where(Cita.tienda_id == tienda_id)
    if not es_gestion(user):
        usuario_id = user.id  # cada profesional ve solo su agenda
    if usuario_id:
        q = q.where(Cita.usuario_id == usuario_id)
    return db.scalars(q).all()


def _solapa(db: Session, usuario_id: int, inicio: datetime, fin: datetime, excluir: int | None = None) -> bool:
    q = select(Cita.id).where(Cita.usuario_id == usuario_id, Cita.inicio < fin, Cita.fin > inicio,
                              Cita.estado.notin_([EstadoCita.cancelada, EstadoCita.no_presentado]))
    if excluir:
        q = q.where(Cita.id != excluir)
    return db.scalar(q) is not None


@router.post("", response_model=CitaOut)
def crear(c: CitaIn, db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    if not es_gestion(user) and c.usuario_id != user.id:
        raise HTTPException(403, "Solo puedes crear citas en tu agenda")
    if c.fin <= c.inicio:
        raise HTTPException(422, "La cita debe terminar después de empezar")
    if _solapa(db, c.usuario_id, c.inicio, c.fin):
        raise HTTPException(409, "Se solapa con otra cita")
    obj = Cita(**c.model_dump())
    db.add(obj)
    db.commit()
    return obj


@router.patch("/{cid}", response_model=CitaOut)
def editar(cid: int, c: CitaUpd, db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    obj = db.get(Cita, cid)
    if not obj:
        raise HTTPException(404, "Cita no encontrada")
    if not es_gestion(user) and obj.usuario_id != user.id:
        raise HTTPException(403, "No es tu cita")
    datos = c.model_dump(exclude_unset=True)
    for k, v in datos.items():
        setattr(obj, k, v)
    if obj.fin <= obj.inicio:
        raise HTTPException(422, "La cita debe terminar después de empezar")
    if {"inicio", "fin", "usuario_id"} & datos.keys() and _solapa(db, obj.usuario_id, obj.inicio, obj.fin, obj.id):
        raise HTTPException(409, "Se solapa con otra cita")
    db.commit()
    return obj
