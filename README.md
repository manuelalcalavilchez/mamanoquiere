# Mamanoquiere Tattoo Ibiza — web + app de gestión

## Desplegar en Easypanel como App (Dockerfile) — rama `verifactu-docker`

Esta rama es la versión FastAPI + app propia, con facturación y VERI\*FACTU, empaquetada en **una sola imagen** (`Dockerfile` en la raíz): PostgreSQL 15, la API y Nginx en el mismo contenedor. Un solo dominio y un solo puerto.

| Ruta | Qué es |
| --- | --- |
| `/` y `/en` | Web pública |
| `/app` | App de gestión (agenda, clientes, caja, facturación, VERI\*FACTU…) |
| `/api/docs` | Documentación de la API |

### Pasos

1. **App** → *Source* → GitHub: owner `manuelalcalavilchez`, repo `mamanoquiere`, rama `verifactu-docker`, build path `/`, *Build* **Dockerfile**.
2. **Volumen (obligatorio):** *Advanced → Mounts → Add Volume*, mount path `/data`. Ahí van la base de datos (`/data/app/pg15`), las fotos y PDF (`/data/media`) y los secretos generados (`/data/app/secrets.env`). Si reutilizas el volumen de la versión Directus, no se pisan: esta versión usa sus propias carpetas.
3. **Entorno**, como mínimo:
   ```env
   ADMIN_EMAIL=tu@email.com
   ADMIN_PASSWORD=una-contraseña-larga
   PUBLIC_URL=https://mamanoquiere.store
   ```
   Opcionales: `POSTGRES_PASSWORD` y `JWT_SECRET` (si no, se generan y se guardan en el volumen), SMTP, Evolution API y `VERIFACTU_CERT_PASSWORD` (ver `.env.example`).
4. **Dominio:** `mamanoquiere.store` → puerto **80**. El subdominio `crm.` ya no hace falta: la gestión está en `/app`.
   Por compatibilidad con la versión Directus, la imagen también atiende en el **3000** (web y app, igual que el 80) y en el **8055** (redirige `/` y `/admin` a `/app/`). Así, un túnel o dominio que apuntaba a esos puertos sigue funcionando sin cambios.
5. **Deploy.** Primer arranque en unos 20 s; en los logs aparece `[mmq] web y app en :80 (/app)`.
6. Entra en `https://mamanoquiere.store/app` con `ADMIN_EMAIL` / `ADMIN_PASSWORD` y sigue «Primeros pasos» (más abajo), en especial **Facturación → Datos fiscales**.

Copia de la base de datos: `docker exec <contenedor> pg_dump -h /run/postgresql -U mmq mamanoquiere > mmq.sql`.

---

## Alternativa: Compose (tres servicios)

Un único despliegue con tres servicios:

| Servicio | Qué es |
| --- | --- |
| `web` | Nginx con la web pública (`/`, `/en`) y la app de gestión (`/app`). Pasa `/api` y `/media` a la API |
| `api` | FastAPI (Python 3.12). Documentación en `/api/docs` |
| `db` | PostgreSQL 16 |

Los datos viven en dos volúmenes: `pgdata` (base de datos) y `media` (fotos, adjuntos, PDF de consentimientos).

## Desplegar con Docker Compose

```bash
cp .env.example .env      # rellena POSTGRES_PASSWORD, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, PUBLIC_URL
docker compose up -d --build
```

La web queda en `http://servidor:8080` (cambia `WEB_PORT` si hace falta). Pon delante el proxy con HTTPS que uses.
Genera el secreto con `openssl rand -hex 32`.

## Desplegar en EasyPanel

1. Sube esta carpeta a un repositorio (Gitea o GitHub).
2. En EasyPanel: nuevo servicio **Compose**, origen Git, ruta `docker-compose.yml`.
3. En **Environment**, pega el contenido de tu `.env`.
4. Quita la línea `ports` del servicio `web` (EasyPanel enruta con Traefik y así no hay conflicto de puertos) y en **Domains** asigna el dominio al servicio `web`, puerto 80, con HTTPS.
5. Despliega. Al arrancar, la API crea las tablas, los dos estudios, las reglas de comisión por defecto y el administrador.

## Primeros pasos después de desplegar

1. Entra en `/app` con `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Después puedes vaciar esas dos variables.
2. **Equipo y estudios**: revisa dirección, teléfono, WhatsApp y horario de Puerto y Beach (hay datos pendientes de validar) y da de alta al equipo.
3. **Comisiones**: ajusta los porcentajes (por defecto: tatuaje 70 %, invitado 60 %, piercing 50 %, producto 10 %).
4. **Personalización**: color de acento, imagen o vídeo de portada, preguntas frecuentes, textos legales revisados por la asesoría, valoración (solo si está verificada) y preguntas del consentimiento.
5. Para enviar mensajes, rellena SMTP y/o Evolution API en el `.env` y vuelve a desplegar.
6. **Facturación → Datos fiscales**: razón social, NIF y domicilio del estudio (sin ellos no se puede facturar), tipos de IVA y series. Ver [docs/FACTURACION.md](docs/FACTURACION.md).

## Copias de seguridad

```bash
docker compose exec db pg_dump -U mamanoquiere mamanoquiere | gzip > backup_$(date +%F).sql.gz
docker run --rm -v mamanoquiere_media:/m -v $PWD:/b alpine tar czf /b/media_$(date +%F).tgz -C /m .
```

El nombre real del volumen aparece en `docker volume ls`. Programa ambas copias a diario.

## Actualizar

```bash
git pull && docker compose up -d --build
```

Al arrancar, la API crea las tablas nuevas, añade las columnas que falten a las existentes y completa los datos antiguos (por ejemplo, el IVA de los trabajos registrados antes de la facturación). Es idempotente. Haz copia de la base de datos antes de cada actualización.

## Desarrollo local

```bash
# API (SQLite)
cd api && pip install -r requirements.txt -r requirements-dev.txt
ADMIN_EMAIL=admin@local ADMIN_PASSWORD=admin12345 uvicorn app.main:app --reload
pytest -q

# Web (en otra terminal): http://localhost:5173
cd web && npm install && npm run dev
```

## Roles

| Rol | Ve |
| --- | --- |
| Administración | Todo, incluida Personalización, Equipo, reglas de comisión, datos fiscales, VERI*FACTU y anular facturas |
| Encargado | Todo salvo Personalización y Equipo; emite tickets, facturas y rectificativas y gestiona descuentos |
| Tatuador, piercer, invitado | Su agenda, sus trabajos, su línea de caja, clientes, consentimiento, su portfolio y las solicitudes que tenga asignadas |

## Limitaciones conocidas

- La web es una SPA: Google la indexa, pero otros buscadores o previsualizaciones de redes pueden no ver títulos por página. Si se necesita, se puede añadir prerenderizado.
- El límite antispam y los envíos de mensajes viven en memoria: la API debe correr con una sola réplica.
- Los PDF de consentimiento (datos de salud) se guardan en el volumen `media` sin cifrar; protege el servidor y las copias.
- Los textos legales y las respuestas de preguntas frecuentes los debe aportar el estudio; la web no los inventa.
- VERI*FACTU: registros, huellas, QR y XML están implementados; el envío a la AEAT no se ha probado todavía en su entorno de pruebas (ver docs/FACTURACION.md).
