# =====================================================================
# Mamanoquiere — imagen única para Easypanel (App → Fuente: GitHub → Dockerfile)
#
#   PostgreSQL 16  (127.0.0.1:5432, solo interno)
#   Directus 11    (CRM / backoffice)  → puerto 8055
#   Web Astro SSR  (web pública)       → puerto 3000
#
# Datos persistentes en /data (montar un volumen en Easypanel: Advanced → Mounts).
# Ver README → "Despliegue con Dockerfile (rama paradocker)".
# =====================================================================
ARG DIRECTUS_IMAGE=directus/directus:11.17.4
ARG NODE_IMAGE=node:22-alpine

# ---------- 1) build de la web ----------
FROM ${NODE_IMAGE} AS web-build
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build && npm prune --omit=dev

# ---------- 2) imagen final sobre Directus oficial ----------
FROM ${DIRECTUS_IMAGE}
USER root
RUN apk add --no-cache postgresql16 postgresql16-contrib su-exec tini

WORKDIR /opt/mmq
COPY --from=web-build --chown=node:node /app/dist ./web/dist
COPY --from=web-build --chown=node:node /app/node_modules ./web/node_modules
COPY --from=web-build --chown=node:node /app/package.json ./web/package.json
COPY db/*.sql ./db/
COPY directus/bootstrap.mjs ./directus/bootstrap.mjs
COPY docker/ ./docker/
RUN chmod +x ./docker/*.sh

ENV DATA_DIR=/data \
    WEB_PORT=3000 \
    NODE_ENV=production \
    TZ=Europe/Madrid

VOLUME ["/data"]
EXPOSE 3000 8055

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${WEB_PORT}/healthz" >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/opt/mmq/docker/entrypoint.sh"]
