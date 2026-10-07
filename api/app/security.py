from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Rol, Usuario

oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")
GESTION = {Rol.admin, Rol.encargado}


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())


def crear_token(user: Usuario) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": str(user.id), "rol": user.rol.value, "exp": exp}, settings.jwt_secret, "HS256")


def usuario_actual(token: str = Depends(oauth2), db: Session = Depends(get_db)) -> Usuario:
    try:
        uid = int(jwt.decode(token, settings.jwt_secret, ["HS256"])["sub"])
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token no válido")
    user = db.get(Usuario, uid)
    if not user or not user.activo:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario inactivo")
    return user


def requiere(*roles: Rol):
    def dep(user: Usuario = Depends(usuario_actual)) -> Usuario:
        if user.rol not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Sin permiso")
        return user
    return dep


solo_gestion = requiere(Rol.admin, Rol.encargado)
solo_admin = requiere(Rol.admin)


def es_gestion(user: Usuario) -> bool:
    return user.rol in GESTION
