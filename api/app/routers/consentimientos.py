from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Cliente, Consentimiento
from ..schemas import ConsentimientoIn, ConsentimientoOut
from ..security import usuario_actual
from ..services.pdf import generar_consentimiento
from .ajustes import obtener as ajustes

router = APIRouter(prefix="/consentimientos", tags=["consentimiento"], dependencies=[Depends(usuario_actual)])


@router.get("/formulario")
def formulario(db: Session = Depends(get_db)):
    """Preguntas y texto legal configurados en Ajustes; la tablet pinta el formulario con esto."""
    a = ajustes(db)
    return {"preguntas": a.preguntas_consentimiento, "texto_legal": a.texto_legal}


@router.post("", response_model=ConsentimientoOut)
def firmar(c: ConsentimientoIn, db: Session = Depends(get_db)):
    if not c.acepta_privacidad:
        raise HTTPException(422, "Hay que aceptar la política de privacidad")
    cliente = db.get(Cliente, c.cliente_id)
    if not cliente:
        raise HTTPException(404, "Cliente no encontrado")
    a = ajustes(db)
    obligatorias = {p["id"] for p in a.preguntas_consentimiento if p.get("obligatoria", True)}
    faltan = obligatorias - c.respuestas.keys()
    if faltan:
        raise HTTPException(422, f"Faltan respuestas: {', '.join(sorted(faltan))}")
    obj = Consentimiento(**c.model_dump(exclude={"acepta_privacidad"}))
    db.add(obj)
    db.commit()
    destino = Path(settings.media_dir) / "consentimientos" / f"{obj.id}.pdf"
    obj.pdf_path = str(generar_consentimiento(obj, cliente, a, destino))
    db.commit()
    return obj


@router.get("/{cid}/pdf")
def pdf(cid: int, db: Session = Depends(get_db)):
    obj = db.get(Consentimiento, cid)
    if not obj or not obj.pdf_path or not Path(obj.pdf_path).exists():
        raise HTTPException(404, "PDF no disponible")
    return FileResponse(obj.pdf_path, media_type="application/pdf", filename=f"consentimiento_{cid}.pdf")
