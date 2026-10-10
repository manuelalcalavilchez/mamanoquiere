#!/bin/sh
# =====================================================================
# Arranque de la imagen única: PostgreSQL → API → Nginx.
# La API crea/actualiza sus tablas al arrancar (app/migraciones.py).
# Si la API o Nginx caen, el contenedor termina y Easypanel lo reinicia.
# =====================================================================
set -eu
DATA="${DATA_DIR:-/data}"
APPDATA="$DATA/app"                 # separado de otros despliegues que usen el mismo volumen
PGDATA="$APPDATA/pg15"
PGBIN=/usr/lib/postgresql/15/bin
DB=mamanoquiere
log() { echo "[mmq] $*"; }
rand() { head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n' | cut -c1-"${1:-40}"; }

mkdir -p "$APPDATA" "$DATA/media"

# ---------- secretos: se generan una vez y se guardan en el volumen ----------
SECRETS="$APPDATA/secrets.env"
if [ ! -f "$SECRETS" ]; then
  umask 077
  {
    echo "GEN_POSTGRES_PASSWORD=$(rand)"
    echo "GEN_JWT_SECRET=$(rand 64)"
    echo "GEN_ADMIN_PASSWORD=$(rand 20)"
  } > "$SECRETS"
  umask 022
  log "secretos generados en $SECRETS"
fi
# shellcheck disable=SC1090
. "$SECRETS"
# Las variables de Easypanel tienen prioridad sobre las generadas
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$GEN_POSTGRES_PASSWORD}"
JWT_SECRET="${JWT_SECRET:-$GEN_JWT_SECRET}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
if [ -z "${ADMIN_PASSWORD:-}" ]; then
  ADMIN_PASSWORD="$GEN_ADMIN_PASSWORD"
  log "ADMIN_PASSWORD no definido: usando el generado (ver $SECRETS → GEN_ADMIN_PASSWORD)"
fi

# ---------- PostgreSQL ----------
mkdir -p /run/postgresql && chown postgres:postgres /run/postgresql
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  log "inicializando PostgreSQL"
  mkdir -p "$PGDATA" && chown -R postgres:postgres "$APPDATA" && chmod 700 "$PGDATA"
  PWFILE=$(mktemp); echo "$POSTGRES_PASSWORD" > "$PWFILE"; chown postgres "$PWFILE"
  runuser -u postgres -- "$PGBIN/initdb" -D "$PGDATA" -U mmq --pwfile="$PWFILE" -E UTF8 --locale=C.UTF-8 \
          --auth-local=trust --auth-host=scram-sha-256 >/dev/null
  rm -f "$PWFILE"
  NEW_DB=1
else
  chown -R postgres:postgres "$PGDATA"
  NEW_DB=0
fi
runuser -u postgres -- "$PGBIN/pg_ctl" -D "$PGDATA" -l "$APPDATA/postgres.log" -w -t 60 \
  -o "-c listen_addresses=127.0.0.1 -c unix_socket_directories=/run/postgresql -c max_connections=40 -c shared_buffers=64MB" \
  start >/dev/null
log "PostgreSQL listo"
PSQL="psql -h /run/postgresql -U mmq -v ON_ERROR_STOP=1 -q"
[ "$NEW_DB" = 1 ] && $PSQL -d postgres -c "CREATE DATABASE $DB"
# Contraseña siempre sincronizada con el entorno (permite rotarla desde Easypanel)
$PSQL -d "$DB" -c "ALTER ROLE mmq PASSWORD '$POSTGRES_PASSWORD'"

# ---------- API ----------
export DATABASE_URL="postgresql+psycopg://mmq:$POSTGRES_PASSWORD@127.0.0.1:5432/$DB"
export JWT_SECRET ADMIN_EMAIL ADMIN_PASSWORD
export ROOT_PATH=/api MEDIA_DIR="$DATA/media" CORS_ORIGINS="${PUBLIC_URL:-http://localhost}"
cd /srv
uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips '*' &
API_PID=$!

# ---------- Nginx (esperar a que la API responda) ----------
for i in $(seq 1 60); do
  python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/salud')" 2>/dev/null && break
  kill -0 "$API_PID" 2>/dev/null || { log "la API no ha arrancado"; exit 1; }
  sleep 1
done
nginx -g 'daemon off;' &
NGINX_PID=$!

shutdown() {
  log "parando…"
  kill "$NGINX_PID" "$API_PID" 2>/dev/null || true
  wait "$NGINX_PID" "$API_PID" 2>/dev/null || true
  runuser -u postgres -- "$PGBIN/pg_ctl" -D "$PGDATA" -m fast -w stop >/dev/null || true
  exit "${1:-0}"
}
trap 'shutdown 0' TERM INT

log "web y app en :80 (/app) · API interna en :8000"
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 5 & wait $!
done
log "un proceso ha terminado: reiniciando contenedor"
shutdown 1
