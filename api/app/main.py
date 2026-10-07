from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import Base, engine
from .routers import (ajustes, auth, caja, citas, clientes, consentimientos, equipo, leads, mensajes, publico,
                      trabajos)

Base.metadata.create_all(engine)  # tablas nuevas; para cambios de columnas usar Alembic

if settings.admin_email and settings.admin_password:
    from .seed import main as _seed
    _seed(settings.admin_email, settings.admin_password)

app = FastAPI(title="Mamanoquiere — API", version="1.0.0", root_path=settings.root_path)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","), allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (auth, ajustes, equipo, clientes, citas, trabajos, caja, consentimientos, mensajes, leads, publico):
    app.include_router(r.router)

# Solo fotos del portfolio/trabajos; los PDF de consentimiento se sirven con login
(Path(settings.media_dir) / "trabajos").mkdir(parents=True, exist_ok=True)
app.mount("/media/trabajos", StaticFiles(directory=Path(settings.media_dir) / "trabajos"), name="fotos")
(Path(settings.media_dir) / "web").mkdir(parents=True, exist_ok=True)
app.mount("/media/web", StaticFiles(directory=Path(settings.media_dir) / "web"), name="web")


@app.get("/salud")
def salud():
    return {"ok": True}
