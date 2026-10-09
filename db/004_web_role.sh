#!/bin/sh
# Contraseña del rol de solo-lectura + alta de leads usado por la web
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "ALTER ROLE web_app PASSWORD '${WEB_DB_PASSWORD}';"
