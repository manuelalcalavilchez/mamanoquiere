# =====================================================================
# Mamanoquiere — imagen única para Easypanel (App → Fuente: GitHub → Dockerfile)
#
#   PostgreSQL 15   (solo interno, socket local)
#   API FastAPI     (127.0.0.1:8000, solo interno)
#   Nginx           (puerto 80; también 3000 y 8055 por compatibilidad con la versión Directus):
#                   web pública, app de gestión /app, /api y /media
#
# Datos persistentes en /data (montar un volumen en Easypanel: Advanced → Mounts).
# Ver README → "Desplegar en Easypanel como App (Dockerfile)".
# =====================================================================

# ---------- 1) build de la web/app (Vite + React) ----------
FROM node:22-alpine AS web-build
WORKDIR /src
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- 2) imagen final ----------
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    DATA_DIR=/data TZ=Europe/Madrid

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql nginx tini \
 && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled/default

WORKDIR /srv
COPY api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY api/app ./app

COPY --from=web-build /src/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/mmq-app.conf /etc/nginx/mmq-app.conf
COPY docker/start.sh /usr/local/bin/mmq-start
RUN chmod +x /usr/local/bin/mmq-start

VOLUME ["/data"]
EXPOSE 80 3000 8055

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1/api/salud')" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/mmq-start"]
