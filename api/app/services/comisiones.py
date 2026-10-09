from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ReglaComision, TipoServicio, Usuario


def porcentaje_para(db: Session, usuario: Usuario, tipo: TipoServicio, tienda_id: int | None) -> int:
    """Devuelve el % del profesional según la regla más específica.
    Prioridad: usuario > rol > genérica; a igualdad, la de la tienda gana a la global."""
    reglas = db.scalars(select(ReglaComision).where(ReglaComision.tipo_servicio == tipo)).all()

    def puntuacion(r: ReglaComision) -> int | None:
        if r.usuario_id is not None and r.usuario_id != usuario.id:
            return None
        if r.rol is not None and r.rol != usuario.rol:
            return None
        if r.tienda_id is not None and r.tienda_id != tienda_id:
            return None
        p = 0
        if r.usuario_id is not None:
            p += 100
        elif r.rol is not None:
            p += 10
        if r.tienda_id is not None:
            p += 1
        return p

    candidatas = [(puntuacion(r), r) for r in reglas]
    candidatas = [(p, r) for p, r in candidatas if p is not None]
    if not candidatas:
        raise ValueError(f"No hay regla de comisión para {tipo.value}")
    return max(candidatas, key=lambda x: x[0])[1].porcentaje


def repartir(importe_cent: int, porcentaje: int) -> tuple[int, int]:
    """Redondeo a favor del estudio: el profesional recibe el entero inferior."""
    profesional = importe_cent * porcentaje // 100
    return profesional, importe_cent - profesional


def reparto_completo(db: Session, cfg: dict, usuario: Usuario, tipo: TipoServicio, tienda_id: int | None,
                     importe_cent: int) -> dict:
    """Reparto + IVA. Si la comisión va 'sobre base', el % se aplica a la base sin IVA y el estudio se queda
    el resto (incluido el IVA, que es quien lo ingresa)."""
    from .fiscal import desglosar

    iva = cfg["iva"].get(tipo.value, 2100)
    base, cuota = desglosar(importe_cent, iva, cfg.get("precios_con_iva", True))
    total = base + cuota
    pct = porcentaje_para(db, usuario, tipo, tienda_id)
    sobre = base if cfg.get("comision_sobre") == "base" else total
    prof, _ = repartir(sobre, pct)
    return {"porcentaje": pct, "profesional_cent": prof, "estudio_cent": total - prof, "iva_x100": iva,
            "base_cent": base, "cuota_iva_cent": cuota, "total_cent": total}
