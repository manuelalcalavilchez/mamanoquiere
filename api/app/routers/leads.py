"""CRM de solicitudes web: bandeja, estados, asignación y conversión a cliente."""
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Cliente, EstadoLead, EventoWeb, Lead, Usuario, ahora
from ..schemas import ClienteOut, LeadOut, LeadUpd
from ..security import es_gestion, solo_gestion, usuario_actual

router = APIRouter(prefix="/leads", tags=["leads"])
ABIERTOS = [EstadoLead.nuevo, EstadoLead.contactado, EstadoLead.pendiente_de_respuesta,
            EstadoLead.presupuesto_enviado, EstadoLead.cita_propuesta]


def _visible(lead: Lead, user: Usuario):
    if not es_gestion(user) and lead.asignado_a != user.id:
        raise HTTPException(403, "Lead no asignado a ti")


@router.get("", response_model=list[LeadOut])
def bandeja(estado: EstadoLead | None = None, tienda_id: int | None = None, servicio: str | None = None,
            abiertos: bool = False, q: str | None = None, limit: int = 100,
            db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    stmt = select(Lead).order_by(Lead.creado.desc()).limit(min(limit, 500))
    if estado:
        stmt = stmt.where(Lead.estado == estado)
    if abiertos:
        stmt = stmt.where(Lead.estado.in_(ABIERTOS))
    if tienda_id:
        stmt = stmt.where(Lead.tienda_id == tienda_id)
    if servicio:
        stmt = stmt.where(Lead.servicio == servicio)
    if q:
        stmt = stmt.where(Lead.nombre.ilike(f"%{q}%") | Lead.telefono.ilike(f"%{q}%"))
    if not es_gestion(user):
        stmt = stmt.where(Lead.asignado_a == user.id)
    return db.scalars(stmt).all()


@router.get("/resumen", dependencies=[Depends(solo_gestion)])
def resumen(dias: int = 30, db: Session = Depends(get_db)):
    """Embudo por estado + eventos de la web del periodo."""
    desde = ahora() - timedelta(days=dias)
    por_estado = dict(db.execute(select(Lead.estado, func.count()).where(Lead.creado >= desde)
                                 .group_by(Lead.estado)).all())
    eventos = dict(db.execute(select(EventoWeb.tipo, func.count()).where(EventoWeb.creado >= desde)
                              .group_by(EventoWeb.tipo)).all())
    return {"dias": dias, "leads": {e.value: por_estado.get(e, 0) for e in EstadoLead}, "eventos_web": eventos}


@router.get("/{lid}", response_model=LeadOut)
def leer(lid: int, db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    lead = db.get(Lead, lid) or _404()
    _visible(lead, user)
    return lead


@router.patch("/{lid}", response_model=LeadOut)
def actualizar(lid: int, datos: LeadUpd, db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    lead = db.get(Lead, lid) or _404()
    _visible(lead, user)
    cambios = datos.model_dump(exclude_unset=True)
    if "asignado_a" in cambios and not es_gestion(user):
        raise HTTPException(403, "Solo gestión asigna leads")
    if "estado" in cambios and cambios["estado"] != lead.estado:
        lead.historial = [*lead.historial, {"de": lead.estado.value, "a": cambios["estado"].value,
                                            "por": user.id, "en": ahora().isoformat(timespec="seconds")}]
    for k, v in cambios.items():
        setattr(lead, k, v)
    db.commit()
    return lead


@router.post("/{lid}/convertir", response_model=ClienteOut)
def convertir(lid: int, db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    """Crea (o enlaza por teléfono/email) el cliente a partir del lead."""
    lead = db.get(Lead, lid) or _404()
    _visible(lead, user)
    if lead.cliente_id:
        return db.get(Cliente, lead.cliente_id)
    existente = db.scalar(select(Cliente).where((Cliente.telefono == lead.telefono) |
                                                ((Cliente.email == lead.email) & (Cliente.email.isnot(None)))))
    cliente = existente or Cliente(nombre=lead.nombre, telefono=lead.telefono, email=lead.email,
                                   acepta_comunicaciones=lead.acepta_comunicaciones,
                                   notas=f"Desde lead web #{lead.id}")
    if not existente:
        db.add(cliente)
        db.flush()
    lead.cliente_id = cliente.id
    db.commit()
    return cliente


@router.get("/{lid}/adjuntos/{nombre}")
def adjunto(lid: int, nombre: str, db: Session = Depends(get_db), user: Usuario = Depends(usuario_actual)):
    lead = db.get(Lead, lid) or _404()
    _visible(lead, user)
    if nombre not in lead.adjuntos:
        raise HTTPException(404, "Adjunto no encontrado")
    return FileResponse(Path(settings.media_dir) / "leads" / nombre)


def _404():
    raise HTTPException(404, "Lead no encontrado")
