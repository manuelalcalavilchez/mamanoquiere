from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Usuario
from ..schemas import Token, UsuarioOut
from ..security import crear_token, usuario_actual, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.scalar(select(Usuario).where(Usuario.email == form.username.lower()))
    if not user or not user.activo or not verify_password(form.password, user.password_hash):
        raise HTTPException(401, "Credenciales incorrectas")
    return Token(access_token=crear_token(user))


@router.get("/yo", response_model=UsuarioOut)
def yo(user: Usuario = Depends(usuario_actual)):
    return user
