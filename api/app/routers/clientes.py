from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Cita, Cliente, Consentimiento, Trabajo
from ..schemas import CitaOut, ClienteIn, ClienteOut, ConsentimientoOut, TrabajoOut
from ..security import solo_admin, usuario_actual

router = APIRouter(prefix="/clientes", tags=["clientes"], dependencies=[Depends(usuario_actual)])


@router.get("", response_model=list[ClienteOut])
def buscar(q: str | None = None, limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    stmt = select(Cliente).order_by(Cliente.nombre).limit(limit).offset(offset)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Cliente.nombre.ilike(like), Cliente.email.ilike(like), Cliente.telefono.ilike(like)))
    return db.scalars(stmt).all()


@router.post("", response_model=ClienteOut)
def crear(c: ClienteIn, db: Session = Depends(get_db)):
    obj = Cliente(**c.model_dump())
    db.add(obj)
    db.commit()
    return obj


@router.get("/{cid}", response_model=ClienteOut)
def leer(cid: int, db: Session = Depends(get_db)):
    return db.get(Cliente, cid) or _404()


@router.put("/{cid}", response_model=ClienteOut)
def editar(cid: int, c: ClienteIn, db: Session = Depends(get_db)):
    obj = db.get(Cliente, cid) or _404()
    for k, v in c.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    return obj


@router.get("/{cid}/historial")
def historial(cid: int, db: Session = Depends(get_db)):
    db.get(Cliente, cid) or _404()
    return {
        "trabajos": [TrabajoOut.model_validate(t) for t in db.scalars(
            select(Trabajo).where(Trabajo.cliente_id == cid).order_by(Trabajo.fecha.desc()))],
        "citas": [CitaOut.model_validate(c) for c in db.scalars(
            select(Cita).where(Cita.cliente_id == cid).order_by(Cita.inicio.desc()))],
        "consentimientos": [ConsentimientoOut.model_validate(c) for c in db.scalars(
            select(Consentimiento).where(Consentimiento.cliente_id == cid).order_by(Consentimiento.creado.desc()))],
    }


@router.delete("/{cid}", status_code=204, dependencies=[Depends(solo_admin)])
def borrar(cid: int, db: Session = Depends(get_db)):
    """Derecho de supresión (RGPD): anonimiza en lugar de borrar para no romper la contabilidad."""
    obj = db.get(Cliente, cid) or _404()
    obj.nombre, obj.email, obj.telefono, obj.documento, obj.notas = "Cliente eliminado", None, None, None, None
    obj.fecha_nacimiento, obj.acepta_comunicaciones = None, False
    db.commit()


def _404():
    raise HTTPException(404, "Cliente no encontrado")
