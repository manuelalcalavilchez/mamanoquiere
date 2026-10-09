#!/bin/sh
# =====================================================================
# Arranque de la imagen única: Postgres → migraciones → Directus → web
# → configuración de Directus. Si Directus o la web caen, el contenedor
# termina y Easypanel lo reinicia.
# =====================================================================
set -eu
DATA="${DATA_DIR:-/data}"
PGDATA="$DATA/pg"
DB=mamanoquiere
APP=/opt/mmq
log() { echo "[mmq] $*"; }
rand() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' | cut -c1-"${1:-40}"; }

# ---------- secretos: se generan una vez y se guardan en el volumen ----------
SECRETS="$DATA/secrets.env"
if [ ! -f "$SECRETS" ]; then
  umask 077
  {
    echo "GEN_DB_PASSWORD=$(rand)"
    echo "GEN_WEB_DB_PASSWORD=$(rand)"
    echo "GEN_DIRECTUS_SECRET=$(rand 64)"
    echo "GEN_IP_HASH_SALT=$(rand 32)"
    echo "GEN_ADMIN_PASSWORD=$(rand 20)"
  } > "$SECRETS"
  log "secretos generados en $SECRETS"
fi
# shellcheck disable=SC1090
. "$SECRETS"
# Las variables de Easypanel tienen prioridad sobre las generadas
DB_PASSWORD="${DB_PASSWORD:-$GEN_DB_PASSWORD}"
WEB_DB_PASSWORD="${WEB_DB_PASSWORD:-$GEN_WEB_DB_PASSWORD}"
DIRECTUS_SECRET="${DIRECTUS_SECRET:-$GEN_DIRECTUS_SECRET}"
IP_HASH_SALT="${IP_HASH_SALT:-$GEN_IP_HASH_SALT}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
if [ -z "${ADMIN_PASSWORD:-}" ]; then
  ADMIN_PASSWORD="$GEN_ADMIN_PASSWORD"
  log "ADMIN_PASSWORD no definido: usando el generado (ver $SECRETS → GEN_ADMIN_PASSWORD)"
fi

# ---------- PostgreSQL ----------
FIRST_RUN=0
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  log "inicializando PostgreSQL"
  PWFILE=$(mktemp); echo "$DB_PASSWORD" > "$PWFILE"
  initdb -D "$PGDATA" -U mmq --pwfile="$PWFILE" -E UTF8 --locale=C.UTF-8 \
         --auth-local=trust --auth-host=scram-sha-256 >/dev/null
  rm -f "$PWFILE"
  FIRST_RUN=1
fi
pg_ctl -D "$PGDATA" -l "$DATA/postgres.log" -w -t 60 \
       -o "-c listen_addresses=127.0.0.1 -c unix_socket_directories=/run/postgresql -c max_connections=60 -c shared_buffers=64MB" start >/dev/null
log "PostgreSQL listo"

PSQL="psql -h /run/postgresql -U mmq -v ON_ERROR_STOP=1 -q"
[ "$FIRST_RUN" = 1 ] && $PSQL -d postgres -c "CREATE DATABASE $DB"
# Contraseñas siempre sincronizadas con el entorno (permite rotarlas desde Easypanel)
$PSQL -d "$DB" -c "ALTER ROLE mmq PASSWORD '$DB_PASSWORD'"

# Migraciones: cada db/NNN_*.sql se aplica una vez, en orden, en su propia transacción
$PSQL -d "$DB" -c "CREATE SCHEMA IF NOT EXISTS mmq_meta; CREATE TABLE IF NOT EXISTS mmq_meta.migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
for f in "$APP"/db/*.sql; do
  name=$(basename "$f")
  done_=$($PSQL -d "$DB" -tAc "SELECT 1 FROM mmq_meta.migrations WHERE name = '$name'")
  if [ "$done_" != 1 ]; then
    log "migración $name"
    $PSQL -d "$DB" -1 -f "$f" -c "INSERT INTO mmq_meta.migrations (name) VALUES ('$name')" >/dev/null
  fi
done
$PSQL -d "$DB" -c "ALTER ROLE web_app PASSWORD '$WEB_DB_PASSWORD'"

# ---------- Directus ----------
export DB_CLIENT=pg DB_HOST=127.0.0.1 DB_PORT=5432 DB_DATABASE="$DB" DB_USER=mmq DB_PASSWORD
export SECRET="$DIRECTUS_SECRET" ADMIN_EMAIL ADMIN_PASSWORD
export PUBLIC_URL="${CRM_URL:-${PUBLIC_URL:-http://localhost:8055}}"
export HOST=0.0.0.0 PORT=8055 TELEMETRY="${TELEMETRY:-false}"
export STORAGE_LOCATIONS=local STORAGE_LOCAL_ROOT="$DATA/uploads" EXTENSIONS_PATH="$DATA/extensions"
export ASSETS_TRANSFORM_IMAGE_MAX_DIMENSION="${ASSETS_TRANSFORM_IMAGE_MAX_DIMENSION:-2000}"
export FILES_MAX_UPLOAD_SIZE="${FILES_MAX_UPLOAD_SIZE:-25mb}"
export EMAIL_TRANSPORT="${EMAIL_TRANSPORT:-sendmail}"
export LOG_LEVEL="${LOG_LEVEL:-warn}"
cd /directus
node cli.js bootstrap
node cli.js start &
DIRECTUS_PID=$!

# ---------- Web (Astro) ----------
cd "$APP/web"
env -u PORT -u HOST -u SECRET -u DB_PASSWORD -u ADMIN_PASSWORD \
  HOST=0.0.0.0 PORT="${WEB_PORT:-3000}" \
  DATABASE_URL="postgres://web_app:$WEB_DB_PASSWORD@127.0.0.1:5432/$DB" \
  DIRECTUS_INTERNAL_URL=http://127.0.0.1:8055 \
  IP_HASH_SALT="$IP_HASH_SALT" \
  SHOW_PENDING="${SHOW_PENDING:-true}" \
  node dist/server/entry.mjs &
WEB_PID=$!

# ---------- Configuración de Directus (idempotente, en segundo plano) ----------
(
  DIRECTUS_URL=http://127.0.0.1:8055 node "$APP/directus/bootstrap.mjs" \
    && log "Directus configurado" || log "AVISO: la configuración de Directus falló (se reintenta en el próximo arranque)"
) &

shutdown() {
  log "parando…"
  kill "$WEB_PID" "$DIRECTUS_PID" 2>/dev/null || true
  wait "$WEB_PID" "$DIRECTUS_PID" 2>/dev/null || true
  pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null || true
  exit "${1:-0}"
}
trap 'shutdown 0' TERM INT

log "web en :${WEB_PORT:-3000} · CRM en :8055"
while kill -0 "$DIRECTUS_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 5 & wait $!
done
log "un proceso ha terminado: reiniciando contenedor"
shutdown 1
