#!/bin/sh
# Prepara /data como root y arranca todo como usuario sin privilegios (node).
set -eu
DATA="${DATA_DIR:-/data}"

mkdir -p "$DATA/pg" "$DATA/uploads" "$DATA/extensions" /run/postgresql
chown node:node "$DATA" "$DATA/uploads" "$DATA/extensions" /run/postgresql
# Solo recorre pg si el propietario no es node (evita chown -R en cada arranque)
[ "$(stat -c %u "$DATA/pg")" = "1000" ] || chown -R node:node "$DATA/pg"
chmod 700 "$DATA/pg"

exec su-exec node /opt/mmq/docker/start.sh
