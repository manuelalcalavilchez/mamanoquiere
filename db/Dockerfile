# Postgres con el esquema incluido: se aplica solo en el primer arranque (volumen vacío)
FROM postgres:16-alpine
COPY *.sql *.sh /docker-entrypoint-initdb.d/
RUN chmod +x /docker-entrypoint-initdb.d/*.sh
