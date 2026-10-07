# API — Mamanoquiere Tattoo Ibiza (gestión + web)

FastAPI + PostgreSQL. Importes en céntimos. Documentación interactiva en `/docs`.

## Arranque

```bash
cp .env.example .env          # cambia JWT_SECRET
docker compose up -d --build
docker compose exec api python -m app.seed admin@estudio.com 'contraseña-segura'
```

Local sin Docker (SQLite): `pip install -r requirements.txt && python -m app.seed a@b.com 12345678 && uvicorn app.main:app --reload`
Tests: `pytest -q`

## Módulos

| Ruta | Qué hace |
| --- | --- |
| `POST /auth/login`, `GET /auth/yo` | Login JWT |
| `GET/PUT /ajustes` | Marca, tema (colores, modo oscuro, densidad, fuentes, radio), módulos activos, preguntas del consentimiento, texto legal. `GET` es público para que el frontend se tematice al arrancar |
| `/tiendas`, `/usuarios` | Tiendas y equipo. Roles: admin, encargado, tatuador, piercer, invitado |
| `/comisiones/reglas`, `/comisiones/simular` | Reglas de % configurables. Gana la más específica: usuario > rol > genérica (la de tienda desempata) |
| `/clientes`, `/clientes/{id}/historial` | Ficha, búsqueda, historial. `DELETE` anonimiza (RGPD) |
| `/citas` | Agenda por tienda y profesional, control de solapes |
| `/trabajos` | Registro con reparto calculado y congelado; foto; publicar en portfolio |
| `/caja/resumen`, `/caja/cierres`, `/caja/export.csv` | Resumen diario por persona y forma de pago; el cierre congela el día y bloquea cambios |
| `/consentimientos` | Formulario configurable, firma, PDF generado |
| `/mensajes` | Email (SMTP) o WhatsApp (Evolution API), `{nombre}` personaliza; solo a clientes que aceptaron |
| `/publico/web` | Marca, tema (acento editable), idiomas, SEO y valoración verificada para pintar la web |
| `/publico/ubicaciones` | Puerto y Beach: dirección, horario, WhatsApp, rutas Google/Apple Maps y JSON-LD `TattooParlor` |
| `POST /publico/leads` | Formulario de cita/presupuesto: hasta 5 imágenes (JPG/PNG/WEBP/HEIC, 8 MB), honeypot, límite por IP, RGPD; crea lead `nuevo` con etiquetas automáticas |
| `POST /publico/eventos` | Eventos de conversión anónimos (llamar, WhatsApp, Instagram, cómo llegar, formulario, portfolio). Solo con consentimiento de cookies |
| `/publico/portfolio` | Portfolio público filtrable por artista, local y servicio |
| `/leads`, `/leads/resumen`, `/leads/{id}/convertir` | Bandeja CRM, 9 estados con historial, asignación, embudo + eventos, conversión a cliente |

## Permisos

Tatuadores, piercers e invitados ven y registran solo lo suyo (agenda, trabajos, su línea de caja). Admin y encargado ven todo; solo admin cambia ajustes, equipo y reglas.

## Comisiones por defecto (seed)

Tatuaje 70 %, tatuaje invitado 60 %, piercing 50 %, producto 10 %. El redondeo favorece al estudio.

## Datos de los locales

El seed carga Puerto (Carrer de Carles III, 21) y Beach (Carrer del País Basc, 13) con teléfono y horario tomados de fichas públicas. **Pendiente de validar con el estudio**: en algún directorio Beach aparece en Av. Pere Matutes Noguera, 11 y con otro teléfono. La valoración media no se publica hasta tenerla verificada (`ajustes.web.valoracion`).

## Pendiente antes de producción

Migraciones con Alembic, copias de seguridad de la BD y de `/data/media`, cifrado en reposo de los consentimientos (datos de salud), y revisión legal del texto de consentimiento.
