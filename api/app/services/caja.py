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
    iva: dict[int, dict] = {}
    for t in trabajos:
        g = iva.setdefault(t.iva_x100 or 0, {"iva_x100": t.iva_x100 or 0, "base_cent": 0, "cuota_cent": 0})
        g["base_cent"] += t.base_cent if t.base_cent is not None else t.importe_cent
        g["cuota_cent"] += t.cuota_iva_cent or 0
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
        "iva": sorted(iva.values(), key=lambda g: -g["iva_x100"]),
        "base_cent": sum(g["base_cent"] for g in iva.values()),
        "cuota_iva_cent": sum(g["cuota_cent"] for g in iva.values()),
        "descuentos_cent": sum(t.descuento_cent or 0 for t in trabajos),
        "sin_factura": sum(1 for t in trabajos if not t.factura_id),
        "personas": personas,
    }


def dia_cerrado(db: Session, tienda_id: int, fecha: date) -> bool:
    return db.scalar(select(CierreCaja.id).where(
        CierreCaja.tienda_id == tienda_id, CierreCaja.fecha == fecha)) is not None
