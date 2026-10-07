from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import CierreCaja, Trabajo


def resumen_dia(db: Session, tienda_id: int, fecha: date) -> dict:
    trabajos = db.scalars(
        select(Trabajo).where(Trabajo.tienda_id == tienda_id, Trabajo.fecha == fecha)
    ).all()
    por_persona: dict[int, dict] = defaultdict(lambda: {
        "trabajos": 0, "facturado_cent": 0, "profesional_cent": 0, "estudio_cent": 0,
        "por_servicio": defaultdict(int),
    })
    por_pago: dict[str, int] = defaultdict(int)
    for t in trabajos:
        p = por_persona[t.usuario_id]
        p["nombre"] = t.usuario.nombre
        p["rol"] = t.usuario.rol.value
        p["trabajos"] += 1
        p["facturado_cent"] += t.importe_cent
        p["profesional_cent"] += t.profesional_cent
        p["estudio_cent"] += t.estudio_cent
        p["por_servicio"][t.tipo_servicio.value] += t.importe_cent
        por_pago[t.forma_pago.value] += t.importe_cent

    personas = [{"usuario_id": uid, **{k: (dict(v) if k == "por_servicio" else v) for k, v in d.items()}}
                for uid, d in por_persona.items()]
    personas.sort(key=lambda x: -x["facturado_cent"])
    return {
        "tienda_id": tienda_id,
        "fecha": fecha.isoformat(),
        "facturado_cent": sum(t.importe_cent for t in trabajos),
        "profesionales_cent": sum(t.profesional_cent for t in trabajos),
        "estudio_cent": sum(t.estudio_cent for t in trabajos),
        "por_forma_pago": dict(por_pago),
        "personas": personas,
    }


def dia_cerrado(db: Session, tienda_id: int, fecha: date) -> bool:
    return db.scalar(select(CierreCaja.id).where(
        CierreCaja.tienda_id == tienda_id, CierreCaja.fecha == fecha)) is not None
