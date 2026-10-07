from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ReglaComision, Tienda, Usuario
from ..schemas import (ReglaIn, ReglaOut, RepartoPreview, TiendaIn, TiendaOut, UsuarioIn, UsuarioOut,
                       UsuarioUpd)
from ..models import TipoServicio
from ..security import hash_password, solo_admin, solo_gestion, usuario_actual
from ..services.comisiones import porcentaje_para, repartir

router = APIRouter(tags=["equipo"])


# Tiendas
@router.get("/tiendas", response_model=list[TiendaOut], dependencies=[Depends(usuario_actual)])
def tiendas(db: Session = Depends(get_db)):
    return db.scalars(select(Tienda).order_by(Tienda.id)).all()


@router.post("/tiendas", response_model=TiendaOut, dependencies=[Depends(solo_admin)])
def crear_tienda(t: TiendaIn, db: Session = Depends(get_db)):
    obj = Tienda(**t.model_dump())
    db.add(obj)
    db.commit()
    return obj


@router.put("/tiendas/{tid}", response_model=TiendaOut, dependencies=[Depends(solo_admin)])
def editar_tienda(tid: int, t: TiendaIn, db: Session = Depends(get_db)):
    obj = db.get(Tienda, tid) or _404()
    for k, v in t.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    return obj


# Usuarios
@router.get("/usuarios", response_model=list[UsuarioOut], dependencies=[Depends(usuario_actual)])
def usuarios(tienda_id: int | None = None, db: Session = Depends(get_db)):
    q = select(Usuario).where(Usuario.activo.is_(True)).order_by(Usuario.nombre)
    if tienda_id:
        q = q.where(Usuario.tienda_id == tienda_id)
    return db.scalars(q).all()


@router.post("/usuarios", response_model=UsuarioOut, dependencies=[Depends(solo_admin)])
def crear_usuario(u: UsuarioIn, db: Session = Depends(get_db)):
    if db.scalar(select(Usuario).where(Usuario.email == u.email.lower())):
        raise HTTPException(409, "Email ya registrado")
    datos = u.model_dump(exclude={"password"})
    datos["email"] = u.email.lower()
    obj = Usuario(**datos, password_hash=hash_password(u.password))
    db.add(obj)
    db.commit()
    return obj


@router.patch("/usuarios/{uid}", response_model=UsuarioOut, dependencies=[Depends(solo_admin)])
def editar_usuario(uid: int, u: UsuarioUpd, db: Session = Depends(get_db)):
    obj = db.get(Usuario, uid) or _404()
    datos = u.model_dump(exclude_unset=True)
    if "password" in datos:
        obj.password_hash = hash_password(datos.pop("password"))
    for k, v in datos.items():
        setattr(obj, k, v)
    db.commit()
    return obj


# Reglas de comisión
@router.get("/comisiones/reglas", response_model=list[ReglaOut], dependencies=[Depends(solo_gestion)])
def reglas(db: Session = Depends(get_db)):
    return db.scalars(select(ReglaComision).order_by(ReglaComision.tipo_servicio)).all()


@router.post("/comisiones/reglas", response_model=ReglaOut, dependencies=[Depends(solo_admin)])
def crear_regla(r: ReglaIn, db: Session = Depends(get_db)):
    obj = ReglaComision(**r.model_dump())
    db.add(obj)
    db.commit()
    return obj


@router.put("/comisiones/reglas/{rid}", response_model=ReglaOut, dependencies=[Depends(solo_admin)])
def editar_regla(rid: int, r: ReglaIn, db: Session = Depends(get_db)):
    obj = db.get(ReglaComision, rid) or _404()
    for k, v in r.model_dump().items():
        setattr(obj, k, v)
    db.commit()
    return obj


@router.delete("/comisiones/reglas/{rid}", status_code=204, dependencies=[Depends(solo_admin)])
def borrar_regla(rid: int, db: Session = Depends(get_db)):
    db.delete(db.get(ReglaComision, rid) or _404())
    db.commit()


@router.get("/comisiones/simular", response_model=RepartoPreview, dependencies=[Depends(usuario_actual)])
def simular(usuario_id: int, tipo_servicio: TipoServicio, importe_cent: int, tienda_id: int | None = None,
            db: Session = Depends(get_db)):
    """Lo usa el formulario de trabajo para mostrar el reparto antes de guardar."""
    u = db.get(Usuario, usuario_id) or _404()
    pct = porcentaje_para(db, u, tipo_servicio, tienda_id)
    prof, est = repartir(importe_cent, pct)
    return RepartoPreview(porcentaje=pct, profesional_cent=prof, estudio_cent=est)


def _404():
    raise HTTPException(404, "No encontrado")
