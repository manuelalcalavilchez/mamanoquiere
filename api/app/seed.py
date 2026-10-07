"""Datos iniciales: python -m app.seed admin@estudio.com 'contraseña'"""
import sys

from sqlalchemy import select

from . import defaults
from .db import Base, SessionLocal, engine
from .models import ReglaComision, Rol, Tienda, TipoServicio, Usuario
from .routers.ajustes import obtener
from .security import hash_password


def main(email: str, password: str):
    Base.metadata.create_all(engine)
    db = SessionLocal()
    obtener(db)
    if not db.scalar(select(Tienda.id)):
        db.add_all([Tienda(**t) for t in defaults.TIENDAS])
    if not db.scalar(select(ReglaComision.id)):
        for r in defaults.REGLAS:
            db.add(ReglaComision(tipo_servicio=TipoServicio(r["tipo_servicio"]), porcentaje=r["porcentaje"],
                                 rol=Rol(r["rol"]) if r.get("rol") else None))
    if not db.scalar(select(Usuario).where(Usuario.email == email.lower())):
        db.add(Usuario(nombre="Administrador", email=email.lower(), password_hash=hash_password(password), rol=Rol.admin))
    db.commit()
    db.close()
    print("Datos iniciales listos")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
