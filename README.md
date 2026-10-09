# Mamanoquiere Tattoo Ibiza — Web + CRM (rama `paradocker`)

> Misma aplicación que `astro-directus` (web Astro SSR + CRM Directus + PostgreSQL), empaquetada en **una sola imagen Docker** para desplegar en Easypanel como **App** con fuente GitHub → repositorio → rama → Dockerfile. La opción Compose sigue disponible en `docker-compose.yml`.

## Despliegue con Dockerfile (rama `paradocker`)

La imagen (`Dockerfile` en la raíz) lleva dentro:

| Proceso | Puerto | Uso |
|---|---|---|
| Web Astro | `3000` | web pública; también sirve las imágenes en `/assets/…` (las pide a Directus por dentro) |
| Directus 11.17.4 | `8055` | CRM / backoffice |
| PostgreSQL 16 | solo interno | base de datos |

### Pasos en Easypanel

1. **Crear la app.** Proyecto → **+ Servicio → App**.
2. **Fuente.** Pestaña *Source* → **GitHub**:
   - Owner `manuelalcalavilchez`
   - Repositorio `mamanoquiere`
   - Rama `paradocker`
   - Build path `/`

   En *Build* elige **Dockerfile**, archivo `Dockerfile`.
3. **Volumen (obligatorio).** *Advanced → Mounts → Add Volume*: nombre `mmq-data`, mount path `/data`. Ahí van la base de datos, las fotos subidas y los secretos generados. Sin este volumen, cada redeploy empieza de cero.
4. **Entorno.** En *Environment*, como mínimo:
   ```env
   ADMIN_EMAIL=tu@email.com
   ADMIN_PASSWORD=una-contraseña-larga
   SITE_URL=https://mamanoquiere.tudominio.es
   CRM_URL=https://crm-mamanoquiere.tudominio.es
   SHOW_PENDING=true
   ```
   El resto es opcional (ver `.env.example`).
5. **Dominios.** En *Domains* añade dos, a la misma app:
   - `mamanoquiere.tudominio.es` → puerto **3000**
   - `crm-mamanoquiere.tudominio.es` → puerto **8055**
6. **Deploy.** El primer arranque tarda unos 30–60 s. Al terminar, los logs muestran `[mmq] web en :3000 · CRM en :8055` y `[mmq] Directus configurado`.
7. **Primer acceso al CRM.** Entra con `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Directus pide una vez el email del responsable del proyecto y aceptar su licencia BSL (gratuita por debajo de 5 M$ de facturación).

### Qué hace el arranque

| Momento | Acción |
|---|---|
| Primer arranque | Crea la base de datos y aplica `db/*.sql` en orden. |
| Despliegues posteriores | Aplica solo los ficheros SQL nuevos (registro en `mmq_meta.migrations`). Para cambiar el esquema, añade `db/006_….sql`. |
| Secretos | Las contraseñas internas, la clave de Directus y la sal de IP se generan una vez y se guardan en `/data/secrets.env`. Si defines `DB_PASSWORD`, `WEB_DB_PASSWORD`, `DIRECTUS_SECRET` o `IP_HASH_SALT` en Easypanel, tienen prioridad. |
| Contraseña de admin | Si no defines `ADMIN_PASSWORD`, se genera; está en `GEN_ADMIN_PASSWORD` dentro de ese fichero. |
| CRM | Configura Directus (menús, roles, carpetas, panel) en cada arranque, sin duplicar nada. |
| Fallos | Si la web o Directus se caen, el contenedor termina y Easypanel lo reinicia. Healthcheck en `/healthz`. |

**Modo demo vs. producción**
- `SHOW_PENDING=true` (valor por defecto en esta imagen): barra "Versión de demostración", datos pendientes visibles y fotos importadas visibles. Además, `noindex` y `robots.txt` bloquean la indexación.
- Para producción, pon `SHOW_PENDING=false` y valida los contenidos en el CRM.

### Fotos para la demo

Con la app desplegada, desde tu equipo:
```bash
pip install requests pillow instaloader
export DIRECTUS_URL=https://crm-mamanoquiere.tudominio.es ADMIN_EMAIL=... ADMIN_PASSWORD=...
python tools/import_portfolio.py instagram <perfil_del_estudio> --login <tu_usuario> --limit 40
# o desde una carpeta:
python tools/import_portfolio.py folder ./fotos --limit 40
```

### Copias de seguridad

Todo está en el volumen `mmq-data`. Para un volcado de la base de datos:
```bash
docker exec <contenedor> pg_dump -h /run/postgresql -U mmq mamanoquiere > mmq.sql
```
Para copiar las fotos, haz copia del volumen completo (por ejemplo, con la tarea de backups de volúmenes de Easypanel o con restic).

### Probar en local

```bash
docker build -t mamanoquiere .
docker run -p 3000:3000 -p 8055:8055 -v mmq-data:/data \
  -e ADMIN_EMAIL=admin@example.com -e ADMIN_PASSWORD=admin12345 mamanoquiere
# web: http://localhost:3000/es/   ·   CRM: http://localhost:8055
```

---

## Alternativa: Compose (rama `astro-directus`)

Web pública bilingüe y CRM para un estudio con dos ubicaciones (Puerto y Beach).

## Arquitectura

```
                 ┌──────────────── VPS (Easypanel / Docker) ────────────────┐
 Visitante ──▶   │  web (Astro SSR, Node)  ──SELECT web.* / create_lead()──┐ │
                 │        │                                                  ▼ │
                 │        └─ imágenes ◀── directus (CRM, /assets) ──▶  PostgreSQL 16
 Estudio  ──▶    │                         ▲                               ▲ │
                 │                         └── n8n (avisos, cierres, cumpleaños)┘ │
                 └──────────────────────────────────────────────────────────┘
```

| Pieza | Elección | Por qué |
|---|---|---|
| Base de datos | PostgreSQL 16 | La lógica de negocio vive aquí: embudo de leads, reparto de comisiones, cierres de caja (tablas `cierre_*` recalculadas automáticamente) y vistas públicas. Cualquier cliente (Directus, web, n8n, futura app) obtiene el mismo resultado. |
| CRM | Directus 11 | Backoffice completo sin programarlo: roles, formularios, ficheros con transformación de imágenes, y una app web instalable en móvil o tablet. Licencia gratuita para negocios de menos de 5 M$ de facturación. |
| Web | Astro 5 SSR (adaptador Node) | Envía HTML casi sin JavaScript, lo que da buena velocidad en móvil. Lee la BD con un rol restringido. Los cambios del CRM aparecen en menos de 60 s, sin rebuild. |
| Automatización | n8n y Evolution API (ya existentes) | Avisos de lead nuevo por WhatsApp, envío del cierre diario y felicitaciones. |
| Analítica | Umami self-hosted | Sin cookies publicitarias. Solo se carga si el usuario la acepta. |

Coste de infraestructura: el VPS actual, o uno de 4 GB de RAM a unos 5–10 €/mes. Más el dominio.

## Estructura

```
db/                 imagen Postgres con el esquema (se aplica en el primer arranque)
  001_schema.sql    tablas (negocio, artistas, CRM, comisiones, consentimientos)
  002_logic.sql     triggers, cierres diarios, esquema `web` público, rol web_app
  003_seed.sql      nombre, 2 estudios, servicios base, reglas de reparto del audio
  004_web_role.sh   contraseña del rol web_app
  005_prefill_publico.sql  datos públicos de los estudios (pendientes de validar)
directus/           bootstrap.mjs: configura Directus por API (idempotente)
tools/              import_portfolio.py: fotos de Instagram o carpeta → galería demo
web/                Astro (landing, artistas, perfiles, legales, /api/lead, sitemap, proxy /assets)
Dockerfile          imagen única (Postgres + Directus + web) para Easypanel App
docker/             entrypoint.sh (permisos de /data) y start.sh (arranque, migraciones, supervisión)
docker-compose.yml  db + directus + directus-setup + web + backup diario
.env.example
```

### Despliegue como servicio Compose

1. **Repositorio.** Ya está en GitHub, rama `astro-directus`.
2. **Servicio.** En EasyPanel, **+ Servicio → Compose**, origen Git `https://github.com/manuelalcalavilchez/mamanoquiere.git`, **rama `astro-directus`**, archivo `docker-compose.yml`.
3. **Entorno.** En *Environment* pega `.env.example` y rellena los secretos (`openssl rand -hex 24`). Para enseñarlo deja `SHOW_PENDING=true`.
4. **Dominios.** En *Domains* añade:
   - `WEB_DOMAIN` → servicio `mmqd-web`, puerto `4321`
   - `CRM_DOMAIN` → servicio `mmqd-directus`, puerto `8055`

   Los dos están conectados a la red externa `easypanel` para que Traefik llegue a ellos. Fuera de EasyPanel, quita esa red y publica puertos.

   Si usas Cloudflare Tunnel en vez de Traefik, apunta los dos hostnames a esos servicios.
5. **Deploy.** El orden de arranque es automático:
   - `mmqd-db` crea el esquema y precarga los datos públicos (solo con el volumen vacío).
   - `mmqd-directus` arranca.
   - `mmqd-setup` configura colecciones, menús, roles, carpetas y el panel "Hoy en el estudio", y termina.
   - `mmqd-web` sirve la web.
6. **Comprobación:**
   - `https://WEB_DOMAIN/es/` muestra la barra "Versión de demostración".
   - `https://CRM_DOMAIN` permite entrar con `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

**Notas**
- **Esquema.** Solo se aplica con el volumen `pgdata` vacío. Para rehacer la demo desde cero, borra el volumen y vuelve a desplegar.
- **Bootstrap.** `mmqd-setup` es idempotente y se ejecuta en cada deploy sin duplicar nada.
- **Indexación.** En modo demo la web envía `noindex` (cabecera y meta).

## Preparar la demo con fotos reales

Desde tu máquina, con el CRM ya desplegado:

```bash
pip install requests pillow instaloader
export DIRECTUS_URL=https://CRM_DOMAIN ADMIN_EMAIL=... ADMIN_PASSWORD=...

# Opción A: desde el Instagram del estudio (pide login la primera vez y guarda la sesión)
python tools/import_portfolio.py instagram mamanoquiere_tattoo.ibiza --login <tu_usuario> --limit 40

# Opción B: fotos en carpeta (las que te pase el estudio; pie de foto opcional en un .txt con el mismo nombre)
python tools/import_portfolio.py folder ./fotos --limit 40
```

**Cómo trata las fotos el importador**
- **Proceso.** Las normaliza (orientación, máx. 2000 px), las sube a la carpeta `web-publica` y crea la entrada en *Galería / portfolio*.
- **Portada.** Las 12 primeras salen en la portada (`--featured`).
- **Artistas.** Si un pie de foto menciona `@usuario` y ese usuario está en el campo `instagram` de un artista, la foto se enlaza a ese artista.
- **Modo demo.** Quedan marcadas `demo` y solo se ven con `SHOW_PENDING=true`. En producción no aparece ninguna foto hasta que alguien la marca como pública con autorización del cliente y texto alternativo (lo impone la base de datos).
- **Repeticiones.** Volver a ejecutarlo no duplica fotos.

**Limitaciones**
- Instagram bloquea las peticiones anónimas, sobre todo desde IPs de servidor. Ejecútalo desde tu equipo con sesión iniciada; no lo lances desde el VPS.
- Perfil del estudio: [@mamanoquiere_tattoo.ibiza](https://www.instagram.com/mamanoquiere_tattoo.ibiza/). Confirma con el estudio el permiso para usar las fotos en la web.

## Datos precargados (`db/005_prefill_publico.sql`)

- **Origen.** Instagram `@mamanoquiere_tattoo.ibiza` (perfil del estudio). Dirección, teléfono, horario y enlace de mapa de Puerto y Beach vienen de directorios públicos (Fresha).
- **Estado.** Todo queda `pendiente`. El campo `source_note` de cada estudio indica las discrepancias encontradas: teléfono y horario de Beach.
- **Visibilidad.** En producción esos datos no salen hasta marcarlos `validado`. Mientras tanto la web muestra solo los nombres de los dos estudios.
- **Pendiente.** No hay artistas, precios, FAQ ni textos legales: están vacíos a la espera del estudio.

## Qué configura el bootstrap de Directus

**Menú en español en cuatro grupos**

| Grupo | Colecciones |
|---|---|
| CRM | Solicitudes, Clientes, Citas, Fotos de trabajos, Consentimientos, Mensajes |
| Caja | Ventas, Cierre por estudio, Cierre por artista, Reglas de reparto |
| Contenido web | Artistas, Galería, Servicios, Estilos, Estudios, FAQ, Reseñas, Negocio |
| Sistema | Tablas auxiliares (plegado) |

**Campos y relaciones**
- Desplegables con colores para los estados de leads y citas.
- Relaciones navegables con la ficha relacionada: artista ↔ estilos/estudios/servicios/galería, cliente ↔ citas, cita ↔ fotos, lead ↔ etiquetas/historial.
- Traducciones ES/EN en artistas, servicios, estilos y FAQ.
- Campos calculados en solo lectura: reparto, cierres e historial.
- Datos sensibles ocultos: hash de IP y respuestas del consentimiento.

**Permisos**
- Acceso público solo a las imágenes de la carpeta `web-publica`.

| Rol | Permisos |
|---|---|
| Dirección | Admin. |
| Recepción | Leads, clientes, citas, ventas y fotos. Lectura de catálogo y cierres. Consentimientos sin ver las respuestas de salud. |
| Artista | Solo sus citas (puede cerrarlas con precio y pago), sus clientes, sus ventas, su cierre y su galería. Requiere vincular el usuario en *Artistas → directus_user*. |

**Panel "Hoy en el estudio"**
- Leads nuevos, citas confirmadas y cobrado en las últimas 24 h.
- Últimas solicitudes y próximas citas.

La app de Directus se puede instalar en móvil o tablet desde el navegador ("Añadir a pantalla de inicio").

## Flujo de datos públicos

- **Visibilidad.** La web solo muestra lo que tiene `validation = 'validado'`. Con `SHOW_PENDING=true` (staging) lo pendiente se ve marcado "Pendiente de validar".
- **Fotos de la galería.** Solo se publican si tienen `client_publication_ok` (autorización del cliente) y `alt_es`. Lo impone un CHECK en la base de datos.
- **Reseñas.** Solo se muestran con fuente y fecha (`fetched_at`). Nunca se escriben a mano sin origen.

## Formulario → CRM

`POST /api/lead` hace lo siguiente:

1. **Valida** con zod en el servidor (también lo hace el navegador) y exige email o teléfono.
2. **Filtra spam** con honeypot, time-trap de 3 s y rate limit de 5 envíos cada 10 min por IP (hash).
3. **Guarda** con `web.create_lead()`, que registra la fecha y la versión de la política aceptada (`PRIVACY_VERSION`), el consentimiento de marketing opcional y desmarcado, y las etiquetas `tattoo|piercing`, `puerto|beach` y `web`.
4. **Avisa a n8n** si existe `N8N_LEAD_WEBHOOK`, mandando solo id, nombre, servicio, ubicación y artista.

El formulario funciona sin JavaScript (POST con redirección `?enviado=1`).

## Flujos n8n sugeridos

| Flujo | Disparador | Acción |
|---|---|---|
| Lead nuevo | Webhook `mmq-lead` | WhatsApp a recepción de la ubicación con enlace al lead en Directus |
| Cierre diario | Cron a la hora de cierre | Consulta `cierre_ubicacion` y `cierre_artista` del día y envía el resumen al dueño |
| Felicitaciones | Cron diario | Clientes con `birth_date` hoy **y** `marketing_consent = true`. WhatsApp o email, registrado en `message_log` |
| Recordatorio de cita | Cron cada hora | Citas `confirmada` de mañana, mensaje al cliente |

## Reparto y cierres de caja

Las reglas están en `commission_rules`. Una regla general tiene `artist_id NULL`; una excepción por artista lleva su `artist_id`. Ambas tienen vigencia por fechas.

| Concepto | % para el artista |
|---|---|
| Servicio a cliente propio del artista (`client_origin = 'artista'`) | 70 % |
| Servicio a cliente del estudio | 50 % |
| Venta (piercing, joyería, productos) | 10 % para quien vende |

El reparto se calcula y **congela** al pasar la cita a `realizada`. Si cambian las reglas, los cierres anteriores no varían.

## Pendiente de validar con el estudio

**Datos del negocio y contenido público**
- Razón social, CIF, domicilio y email legal (aviso legal y responsable del tratamiento).
- Dirección, coordenadas, teléfono, WhatsApp, horario y temporada de Puerto y de Beach.
- Fichas de los 9 artistas fijos y guests: nombre público, estilos, ubicación, bio ES/EN, Instagram, retrato y galería con autorización de cada cliente.
- Servicios: descripciones, precio "desde" (o no publicarlo) y duración.
- FAQ: cuidados, señal o depósito, cancelaciones, edad mínima, cover-ups…
- Dominio definitivo y cuenta de Google Business Profile de cada ubicación (clave para SEO local).

**Textos legales (asesoría)**
- Política de privacidad, aviso legal y política de cookies.
- Consentimiento informado y cuestionario de salud: normativa sanitaria de Illes Balears, plazo de conservación y tratamiento de menores.

**Reglas de negocio (del audio)**
- Confirmar por escrito el 70/50/10.
- ¿El piercing hecho en cita cuenta como servicio (70/50) o como venta (10 %)?
- ¿El 10 % se calcula sobre el precio con o sin IVA?
- ¿Cómo se trata la señal o depósito en el cierre?

## Seguridad y RGPD

- La web usa el rol `web_app`: solo lee el esquema `web` y ejecuta `web.create_lead`. No tiene acceso a clientes, citas ni ventas.
- La IP nunca se guarda en claro; se guarda un hash con sal diaria.
- El consentimiento informado tiene datos de salud (art. 9 RGPD):
  - Las respuestas van en `answers_enc`, cifradas con `pgp_sym_encrypt` y una clave guardada fuera de la base de datos.
  - Las firmas van en una carpeta privada.
  - Solo el rol Dirección tiene acceso.
  - Requiere registro de actividades de tratamiento y evaluación de riesgos.
- Las fuentes están alojadas en el propio servidor (sin Google Fonts remoto). Umami solo se carga tras aceptar el banner, que da el mismo peso a aceptar y rechazar.

## Desarrollo local

```bash
cd web && npm install
DATABASE_URL=postgres://web_app:...@localhost:5432/mamanoquiere \
PUBLIC_ASSETS_URL=http://localhost:8055 SHOW_PENDING=true npm run dev
```

Para añadir un idioma:
1. Crea `web/src/i18n/<código>.json` y regístralo en `i18n/index.ts`.
2. Añade una fila en `languages` y sus traducciones en Directus.
