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
