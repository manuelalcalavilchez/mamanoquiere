"""Endpoints sin login para la web pública: ubicaciones, portfolio, solicitudes de cita y analítica."""
import time
import uuid
from collections import defaultdict, deque
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import defaults
from ..config import settings
from ..db import get_db
from ..models import EventoWeb, Lead, Tienda, Trabajo, Usuario
from ..schemas import EventoIn
from .ajustes import obtener as ajustes

router = APIRouter(prefix="/publico", tags=["público"])

ADJUNTOS_OK = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}
MAX_ADJUNTOS, MAX_MB = 5, 8
_ventana: dict[str, deque] = defaultdict(deque)


def _limite(clave: str, max_n: int, segundos: int):
    """Límite simple en memoria por IP (suficiente para 1 instancia; con varias, usar Redis)."""
    ahora, q = time.time(), _ventana[clave]
    while q and q[0] < ahora - segundos:
        q.popleft()
    if len(q) >= max_n:
        raise HTTPException(429, "Demasiadas solicitudes, inténtalo más tarde")
    q.append(ahora)


def _ip(request: Request) -> str:
    return request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0]


def _schema_org(t: Tienda, a) -> dict:
    dias = {"Mo-Su": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]}
    return {
        "@context": "https://schema.org", "@type": "TattooParlor", "name": t.nombre,
        "telephone": t.telefono, "url": f"/{t.slug}",
        "address": {"@type": "PostalAddress", "streetAddress": t.direccion, "postalCode": t.codigo_postal,
                    "addressLocality": t.localidad, "addressRegion": "Illes Balears", "addressCountry": "ES"},
        **({"geo": {"@type": "GeoCoordinates", "latitude": t.lat, "longitude": t.lng}} if t.lat else {}),
        "openingHoursSpecification": [{"@type": "OpeningHoursSpecification", "dayOfWeek": dias.get(h["dias"], h["dias"]),
                                       "opens": h["abre"], "closes": h["cierra"]} for h in t.horario],
        "sameAs": [a.web.get("instagram")] if a.web.get("instagram") else [],
    }


@router.get("/ubicaciones")
def ubicaciones(db: Session = Depends(get_db)):
    a = ajustes(db)
    out = []
    for t in db.scalars(select(Tienda).where(Tienda.activa.is_(True)).order_by(Tienda.id)):
        destino = f"{t.lat},{t.lng}" if t.lat else f"{t.direccion}, {t.codigo_postal} {t.localidad}"
        out.append({
            "id": t.id, "slug": t.slug, "nombre": t.nombre, "direccion": t.direccion,
            "codigo_postal": t.codigo_postal, "localidad": t.localidad, "telefono": t.telefono,
            "whatsapp_url": f"https://wa.me/{''.join(c for c in (t.whatsapp or '') if c.isdigit())}" if t.whatsapp else None,
            "horario": t.horario, "servicios": t.servicios,
            "google_maps": f"https://www.google.com/maps/dir/?api=1&destination={destino}",
            "apple_maps": f"https://maps.apple.com/?daddr={destino}",
            "schema_org": _schema_org(t, a),
        })
    return out


@router.get("/web")
def config_web(db: Session = Depends(get_db)):
    """Lo mínimo que la web necesita para pintarse: marca, tema, idiomas, SEO, valoración verificada."""
    a = ajustes(db)
    return {"nombre": a.nombre_estudio, "logo_url": a.logo_url, "tema": a.tema, "web": a.web,
            "servicios": defaults.SERVICIOS_WEB}


@router.post("/leads", status_code=201)
async def solicitar_cita(
    request: Request,
    nombre: str = Form(..., min_length=2, max_length=160),
    telefono: str = Form(..., min_length=6, max_length=30),
    servicio: str = Form(...),
    acepta_privacidad: bool = Form(...),
    email: str | None = Form(None, max_length=200),
    ubicacion: str | None = Form(None),  # slug: puerto | beach
    zona_corporal: str | None = Form(None, max_length=80),
    tamano: str | None = Form(None, max_length=40),
    fecha_preferida: date | None = Form(None),
    mensaje: str | None = Form(None, max_length=3000),
    pagina_origen: str | None = Form(None, max_length=300),
    idioma: str = Form("es", max_length=5),
    acepta_comunicaciones: bool = Form(False),
    website: str | None = Form(None),  # honeypot: campo oculto que una persona deja vacío
    adjuntos: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    if website:  # bot: respondemos como si fuera bien y no guardamos
        return {"ok": True}
    _limite(f"lead:{_ip(request)}", 5, 600)
    if not acepta_privacidad:
        raise HTTPException(422, "Es necesario aceptar la política de privacidad")
    if servicio not in defaults.SERVICIOS_WEB:
        raise HTTPException(422, "Servicio no válido")
    if len(adjuntos) > MAX_ADJUNTOS:
        raise HTTPException(422, f"Máximo {MAX_ADJUNTOS} imágenes")
    tienda = db.scalar(select(Tienda).where(Tienda.slug == ubicacion)) if ubicacion else None
    if ubicacion and not tienda:
        raise HTTPException(422, "Ubicación no válida")

    rutas = []
    carpeta = Path(settings.media_dir) / "leads"  # privada: no se sirve como estática
    for f in adjuntos:
        ext = ADJUNTOS_OK.get(f.content_type or "")
        if not ext:
            raise HTTPException(415, "Solo imágenes JPG, PNG, WEBP o HEIC")
        datos = await f.read(MAX_MB * 1024 * 1024 + 1)
        if len(datos) > MAX_MB * 1024 * 1024:
            raise HTTPException(413, f"Cada imagen debe pesar menos de {MAX_MB} MB")
        carpeta.mkdir(parents=True, exist_ok=True)
        nombre_f = f"{uuid.uuid4().hex}{ext}"
        (carpeta / nombre_f).write_bytes(datos)
        rutas.append(nombre_f)

    etiquetas = ["web", "tattoo" if servicio == "tattoo" else "piercing"]
    if tienda:
        etiquetas.append(tienda.slug)
    lead = Lead(nombre=nombre.strip(), telefono=telefono.strip(), email=email, servicio=servicio,
                tienda_id=tienda.id if tienda else None, zona_corporal=zona_corporal, tamano=tamano,
                fecha_preferida=fecha_preferida, mensaje=mensaje, pagina_origen=pagina_origen, idioma=idioma,
                adjuntos=rutas, etiquetas=etiquetas, acepta_privacidad=True,
                acepta_comunicaciones=acepta_comunicaciones)
    db.add(lead)
    db.commit()
    return {"ok": True, "id": lead.id}


@router.post("/eventos", status_code=204)
def evento(e: EventoIn, request: Request, db: Session = Depends(get_db)):
    """Solo se llama si el visitante aceptó cookies de analítica. No guarda IP ni datos personales."""
    if e.tipo not in defaults.EVENTOS_WEB:
        raise HTTPException(422, "Evento no válido")
    _limite(f"ev:{_ip(request)}", 120, 60)
    db.add(EventoWeb(**e.model_dump()))
    db.commit()


@router.get("/portfolio")
def portfolio(usuario_id: int | None = None, ubicacion: str | None = None, servicio: str | None = None,
              limit: int = 60, db: Session = Depends(get_db)):
    if not ajustes(db).modulos.get("portfolio", True):
        return {"artistas": [], "trabajos": []}
    q = select(Trabajo).where(Trabajo.en_portfolio.is_(True), Trabajo.foto_url.isnot(None)) \
        .order_by(Trabajo.fecha.desc()).limit(min(limit, 200))
    if usuario_id:
        q = q.where(Trabajo.usuario_id == usuario_id)
    if ubicacion:
        q = q.join(Tienda, Tienda.id == Trabajo.tienda_id).where(Tienda.slug == ubicacion)
    if servicio:
        q = q.where(Trabajo.tipo_servicio == ("tatuaje" if servicio == "tattoo" else servicio))
    trabajos = db.scalars(q).all()
    artistas = db.scalars(select(Usuario).where(Usuario.activo.is_(True),
                                                Usuario.id.in_({t.usuario_id for t in trabajos}))).all()
    return {
        "artistas": [{"id": a.id, "nombre": a.nombre, "rol": a.rol.value, "bio": a.bio} for a in artistas],
        "trabajos": [{"id": t.id, "usuario_id": t.usuario_id, "tienda_id": t.tienda_id, "foto_url": t.foto_url,
                      "descripcion": t.descripcion, "tipo": t.tipo_servicio.value, "fecha": t.fecha} for t in trabajos],
    }
