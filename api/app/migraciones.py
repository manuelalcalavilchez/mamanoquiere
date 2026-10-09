"""Migración ligera al arrancar.

create_all() crea tablas nuevas pero no añade columnas a tablas que ya existen. Aquí se añaden las columnas
que falten (siempre admiten NULL o tienen valor por defecto en BD) y se completan datos antiguos.
Es idempotente: se puede ejecutar en cada arranque.
"""
import logging

from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine

from .db import Base

log = logging.getLogger("migraciones")


def anadir_columnas(engine: Engine) -> list[str]:
    insp = inspect(engine)
    existentes = set(insp.get_table_names())
    hechas = []
    with engine.begin() as con:
        for tabla in Base.metadata.sorted_tables:
            if tabla.name not in existentes:
                continue
            actuales = {c["name"] for c in insp.get_columns(tabla.name)}
            for col in tabla.columns:
                if col.name in actuales:
                    continue
                tipo = col.type.compile(dialect=engine.dialect)
                sql = f'ALTER TABLE "{tabla.name}" ADD COLUMN "{col.name}" {tipo}'
                if col.server_default is not None:
                    sql += f" DEFAULT {col.server_default.arg}"
                con.execute(text(sql))
                hechas.append(f"{tabla.name}.{col.name}")
    for h in hechas:
        log.warning("Columna añadida: %s", h)
    return hechas


def completar_datos(SessionLocal) -> None:
    """Trabajos anteriores a la facturación: precio = importe, IVA por defecto y base/cuota calculadas."""
    from .models import Trabajo
    from .routers.ajustes import obtener
    from .services.fiscal import config_fiscal, desglosar

    db = SessionLocal()
    try:
        cfg = config_fiscal(obtener(db))
        pendientes = db.scalars(select(Trabajo).where(Trabajo.iva_x100.is_(None))).all()
        for t in pendientes:
            t.precio_cent = t.precio_cent or t.importe_cent
            t.descuento_cent = t.descuento_cent or 0
            t.iva_x100 = cfg["iva"].get(t.tipo_servicio.value, 2100)
            t.base_cent, t.cuota_iva_cent = desglosar(t.importe_cent, t.iva_x100)
        if pendientes:
            db.commit()
            log.warning("IVA completado en %s trabajos antiguos", len(pendientes))
    finally:
        db.close()


def migrar(engine: Engine, SessionLocal) -> None:
    Base.metadata.create_all(engine)
    anadir_columnas(engine)
    completar_datos(SessionLocal)
