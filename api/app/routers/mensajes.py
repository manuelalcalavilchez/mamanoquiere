from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..models import Cliente, Mensaje, Usuario
from ..schemas import MensajeIn, MensajeOut
from ..security import solo_gestion
from ..services.mensajeria import enviar_email, enviar_whatsapp, personalizar
from .ajustes import obtener as ajustes

router = APIRouter(prefix="/mensajes", tags=["mensajes"])


def _destinatarios(db: Session, m: MensajeIn) -> list[Cliente]:
    q = select(Cliente).where(Cliente.acepta_comunicaciones.is_(True))  # RGPD: solo quien lo aceptó
    if m.cliente_ids:
        q = q.where(Cliente.id.in_(m.cliente_ids))
    campo = Cliente.email if m.canal == "email" else Cliente.telefono
    return list(db.scalars(q.where(campo.isnot(None))).all())


def _enviar(mensaje_id: int, cliente_ids: list[int]):
    db = SessionLocal()
    try:
        m = db.get(Mensaje, mensaje_id)
        for c in db.scalars(select(Cliente).where(Cliente.id.in_(cliente_ids))):
            texto = personalizar(m.cuerpo, c.nombre)
            ok = enviar_email(c.email, m.asunto or "", texto) if m.canal == "email" else enviar_whatsapp(c.telefono, texto)
            if ok:
                m.enviados += 1
            else:
                m.fallidos += 1
            db.commit()
    finally:
        db.close()


@router.post("/previsualizar")
def previsualizar(m: MensajeIn, db: Session = Depends(get_db), _: Usuario = Depends(solo_gestion)):
    dest = _destinatarios(db, m)
    return {"destinatarios": len(dest), "ejemplo": personalizar(m.cuerpo, dest[0].nombre) if dest else m.cuerpo}


@router.post("", response_model=MensajeOut)
def enviar(m: MensajeIn, tareas: BackgroundTasks, db: Session = Depends(get_db),
           user: Usuario = Depends(solo_gestion)):
    if not ajustes(db).modulos.get("mensajes", True):
        raise HTTPException(403, "Módulo de mensajes desactivado")
    if m.canal == "email" and not m.asunto:
        raise HTTPException(422, "El email necesita asunto")
    dest = _destinatarios(db, m)
    obj = Mensaje(canal=m.canal, asunto=m.asunto, cuerpo=m.cuerpo, destinatarios=len(dest), creado_por=user.id)
    db.add(obj)
    db.commit()
    tareas.add_task(_enviar, obj.id, [c.id for c in dest])
    return obj


@router.get("", response_model=list[MensajeOut], dependencies=[Depends(solo_gestion)])
def historial(db: Session = Depends(get_db)):
    return db.scalars(select(Mensaje).order_by(Mensaje.creado.desc()).limit(100)).all()
