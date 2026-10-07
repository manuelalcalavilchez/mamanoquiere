import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..config import settings

from .. import defaults
from ..db import get_db
from ..models import Ajustes
from ..schemas import AjustesIn, AjustesOut
from ..security import solo_admin

router = APIRouter(prefix="/ajustes", tags=["ajustes"])


def obtener(db: Session) -> Ajustes:
    a = db.get(Ajustes, 1)
    if not a:
        a = Ajustes(id=1, nombre_estudio="Mamanoquiere Tattoo Ibiza", tema=dict(defaults.TEMA),
                    modulos=dict(defaults.MODULOS), preguntas_consentimiento=list(defaults.PREGUNTAS),
                    web=dict(defaults.WEB))
        db.add(a)
        db.commit()
    return a


@router.get("", response_model=AjustesOut)
def leer(db: Session = Depends(get_db)):
    """Público: el frontend lo carga al arrancar para aplicar marca, tema y módulos."""
    return obtener(db)


@router.put("", response_model=AjustesOut, dependencies=[Depends(solo_admin)])
def actualizar(datos: AjustesIn, db: Session = Depends(get_db)):
    a = obtener(db)
    cambios = datos.model_dump(exclude_unset=True)
    # tema y módulos se fusionan para poder cambiar una sola clave
    for clave in ("tema", "modulos", "web"):
        if clave in cambios:
            cambios[clave] = {**getattr(a, clave), **cambios[clave]}
    for k, v in cambios.items():
        setattr(a, k, v)
    db.commit()
    return a


@router.post("/restablecer-tema", response_model=AjustesOut, dependencies=[Depends(solo_admin)])
def restablecer(db: Session = Depends(get_db)):
    a = obtener(db)
    a.tema = dict(defaults.TEMA)
    db.commit()
    return a


MEDIOS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/avif": ".avif",
          "video/mp4": ".mp4", "video/webm": ".webm"}


@router.post("/medios", dependencies=[Depends(solo_admin)])
async def subir_medio(archivo: UploadFile = File(...)):
    """Imagen o vídeo para la web (portada, logo). Se sirve en /media/web/."""
    ext = MEDIOS.get(archivo.content_type or "")
    if not ext:
        raise HTTPException(415, "Formato no admitido: JPG, PNG, WEBP, AVIF, MP4 o WEBM")
    limite = 40 if ext in (".mp4", ".webm") else 10
    datos = await archivo.read(limite * 1024 * 1024 + 1)
    if len(datos) > limite * 1024 * 1024:
        raise HTTPException(413, f"Máximo {limite} MB")
    carpeta = Path(settings.media_dir) / "web"
    carpeta.mkdir(parents=True, exist_ok=True)
    nombre = f"{uuid.uuid4().hex[:12]}{ext}"
    (carpeta / nombre).write_bytes(datos)
    return {"url": f"/media/web/{nombre}"}
