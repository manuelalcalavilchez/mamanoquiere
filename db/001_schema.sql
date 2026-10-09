-- =====================================================================
-- Mamanoquiere Tattoo Ibiza — esquema PostgreSQL 16
-- Compatible con Directus (database-first): PK uuid, FKs explícitas,
-- tablas *_translations con languages_code para i18n extensible.
-- TODO: alinear nombres/campos con el JSON `schema` del estudio
--       (businesses, locations, services, reviews_summary, artists).
-- Estados como text + CHECK (en vez de ENUM) para que Directus los edite sin problemas.
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Nada se publica como definitivo hasta que el estudio lo confirme.

CREATE TABLE languages (
  code        varchar(8) PRIMARY KEY,           -- 'es', 'en', 'it', 'de'...
  name        text NOT NULL,
  direction   varchar(3) NOT NULL DEFAULT 'ltr',
  is_active   boolean NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------------
-- Negocio y ubicaciones
-- ---------------------------------------------------------------------
CREATE TABLE businesses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  legal_name    text,                -- PENDIENTE: razón social
  tax_id        text,                -- PENDIENTE: CIF/NIF (aviso legal)
  email         citext,
  website       text,
  instagram     text,
  validation text NOT NULL DEFAULT 'pendiente' CHECK (validation IN ('pendiente', 'validado')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  slug          text NOT NULL UNIQUE,          -- 'puerto' | 'beach'
  name          text NOT NULL,
  street        text,
  postal_code   text,
  locality      text,
  region        text DEFAULT 'Illes Balears',
  country       char(2) DEFAULT 'ES',
  lat           numeric(9,6),
  lng           numeric(9,6),
  phone         text,                          -- E.164, ej. +34...
  whatsapp      text,                          -- E.164 sin '+'
  email         citext,
  maps_url      text,
  opening_hours jsonb,                         -- [{"days":["Mo","Tu"],"opens":"11:00","closes":"21:00"}]
  seasonal_note text,
  source_note   text,                          -- de dónde sale cada dato mientras esté pendiente
  sort          int DEFAULT 0,
  validation text NOT NULL DEFAULT 'pendiente' CHECK (validation IN ('pendiente', 'validado')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Servicios
-- ---------------------------------------------------------------------

CREATE TABLE services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  slug          text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('tattoo', 'piercing', 'producto', 'otro')),
  price_from    numeric(10,2),                 -- NULL = no se publica precio
  duration_min  int,
  is_public     boolean NOT NULL DEFAULT false,
  sort          int DEFAULT 0,
  validation text NOT NULL DEFAULT 'pendiente' CHECK (validation IN ('pendiente', 'validado'))
);
CREATE TABLE services_translations (
  id             serial PRIMARY KEY,
  services_id    uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  languages_code varchar(8) NOT NULL REFERENCES languages(code),
  name           text NOT NULL,
  description    text,
  price_note     text,
  UNIQUE (services_id, languages_code)
);
CREATE TABLE location_services (
  id           serial PRIMARY KEY,
  location_id  uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  service_id   uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  UNIQUE (location_id, service_id)
);

-- ---------------------------------------------------------------------
-- Reseñas: solo resumen agregado con fuente y fecha. Nunca inventar.
-- ---------------------------------------------------------------------
CREATE TABLE reviews_summary (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   uuid REFERENCES locations(id) ON DELETE CASCADE,
  source        text NOT NULL,                 -- 'google', 'tripadvisor'...
  rating        numeric(2,1) CHECK (rating BETWEEN 0 AND 5),
  review_count  int CHECK (review_count >= 0),
  source_url    text,
  fetched_at    timestamptz,
  validation text NOT NULL DEFAULT 'pendiente' CHECK (validation IN ('pendiente', 'validado')),
  UNIQUE (location_id, source)
);

-- ---------------------------------------------------------------------
-- Artistas
-- ---------------------------------------------------------------------

CREATE TABLE styles (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug  text NOT NULL UNIQUE
);
CREATE TABLE styles_translations (
  id             serial PRIMARY KEY,
  styles_id      uuid NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
  languages_code varchar(8) NOT NULL REFERENCES languages(code),
  name           text NOT NULL,
  UNIQUE (styles_id, languages_code)
);

CREATE TABLE artists (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  slug             text NOT NULL UNIQUE,
  display_name     text NOT NULL,
  legal_name       text,                       -- interno
  status text NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'guest', 'inactivo')),
  guest_from       date,
  guest_until      date,
  instagram        text,
  portrait         uuid,                       -- directus_files.id
  phone_internal   text,                       -- interno
  email_internal   citext,                     -- interno
  directus_user    uuid,                       -- acceso del artista a su agenda
  is_public        boolean NOT NULL DEFAULT false,
  sort             int DEFAULT 0,
  validation text NOT NULL DEFAULT 'pendiente' CHECK (validation IN ('pendiente', 'validado')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'guest' OR guest_from IS NOT NULL)
);
CREATE TABLE artists_translations (
  id             serial PRIMARY KEY,
  artists_id     uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  languages_code varchar(8) NOT NULL REFERENCES languages(code),
  headline       text,
  bio            text,
  UNIQUE (artists_id, languages_code)
);
CREATE TABLE artist_styles (
  id         serial PRIMARY KEY,
  artist_id  uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  style_id   uuid NOT NULL REFERENCES styles(id) ON DELETE CASCADE,
  UNIQUE (artist_id, style_id)
);
CREATE TABLE artist_services (
  id         serial PRIMARY KEY,
  artist_id  uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  UNIQUE (artist_id, service_id)
);
CREATE TABLE artist_locations (
  id          serial PRIMARY KEY,
  artist_id   uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  UNIQUE (artist_id, location_id)
);
CREATE TABLE artist_gallery (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id   uuid REFERENCES artists(id) ON DELETE CASCADE, -- NULL = obra del estudio sin artista asignado
  file        uuid NOT NULL,                   -- directus_files.id
  width       int,
  height      int,
  style_id    uuid REFERENCES styles(id),
  alt_es      text,
  alt_en      text,
  is_featured boolean NOT NULL DEFAULT false,  -- aparece en el portfolio de la home
  is_public   boolean NOT NULL DEFAULT false,
  client_publication_ok boolean NOT NULL DEFAULT false, -- el cliente autorizó publicar
  sort        int DEFAULT 0,
  demo        boolean NOT NULL DEFAULT false,  -- importada para la demo (Instagram); solo visible en staging
  source_url  text,                            -- p.ej. enlace al post original
  caption     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- no se publica sin alt (WCAG) ni sin autorización del cliente
  CHECK (NOT is_public OR (client_publication_ok AND alt_es IS NOT NULL))
);

-- ---------------------------------------------------------------------
-- FAQ
-- ---------------------------------------------------------------------
CREATE TABLE faqs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort       int DEFAULT 0,
  is_public  boolean NOT NULL DEFAULT false,
  validation text NOT NULL DEFAULT 'pendiente' CHECK (validation IN ('pendiente', 'validado'))
);
CREATE TABLE faqs_translations (
  id             serial PRIMARY KEY,
  faqs_id        uuid NOT NULL REFERENCES faqs(id) ON DELETE CASCADE,
  languages_code varchar(8) NOT NULL REFERENCES languages(code),
  question       text NOT NULL,
  answer         text NOT NULL,
  UNIQUE (faqs_id, languages_code)
);

-- =====================================================================
-- CRM
-- =====================================================================
CREATE TABLE clients (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name            text NOT NULL,
  email                citext,
  phone                text,
  birth_date           date,
  preferred_language   varchar(8) REFERENCES languages(code) DEFAULT 'es',
  marketing_consent    boolean NOT NULL DEFAULT false,
  marketing_consent_at timestamptz,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT marketing_consent OR marketing_consent_at IS NOT NULL)
);
CREATE UNIQUE INDEX clients_email_uq ON clients (email) WHERE email IS NOT NULL;
CREATE INDEX clients_phone_idx ON clients (phone);


CREATE TABLE tags (
  id    serial PRIMARY KEY,
  slug  text NOT NULL UNIQUE
);

CREATE TABLE leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'contactado', 'cita_confirmada', 'realizado', 'cancelado')),
  full_name           text NOT NULL,
  email               citext,
  phone               text,
  service_category text CHECK (service_category IN ('tattoo', 'piercing', 'producto', 'otro')),
  location_id         uuid REFERENCES locations(id),
  artist_id           uuid REFERENCES artists(id),
  message             text,
  body_zone           text,
  approx_size         text,
  preferred_dates     text,
  language            varchar(8) REFERENCES languages(code),
  source              text NOT NULL DEFAULT 'web',
  utm                 jsonb,
  privacy_accepted_at timestamptz NOT NULL,
  privacy_version     text NOT NULL,
  marketing_consent   boolean NOT NULL DEFAULT false,
  ip_hash             text,                    -- hash diario, nunca IP en claro
  client_id           uuid REFERENCES clients(id),
  assigned_to         uuid,                    -- directus_users.id
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX leads_status_idx ON leads (status, created_at DESC);

CREATE TABLE lead_tags (
  id      serial PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id  int  NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  UNIQUE (lead_id, tag_id)
);

CREATE TABLE lead_status_history (
  id          bigserial PRIMARY KEY,
  lead_id     uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_status text CHECK (from_status IN ('nuevo', 'contactado', 'cita_confirmada', 'realizado', 'cancelado')),
  to_status text NOT NULL CHECK (to_status IN ('nuevo', 'contactado', 'cita_confirmada', 'realizado', 'cancelado')),
  changed_at  timestamptz NOT NULL DEFAULT now()
);

-- Reglas de reparto. artist_id NULL = regla general; con artist_id = excepción.
-- Valores iniciales en 003_seed (sacados del audio del estudio) — PENDIENTES.
CREATE TABLE commission_rules (
  id          serial PRIMARY KEY,
  artist_id   uuid REFERENCES artists(id) ON DELETE CASCADE,
  applies_to  text NOT NULL CHECK (applies_to IN ('servicio_cliente_artista','servicio_cliente_estudio','venta')),
  artist_pct  numeric(5,2) NOT NULL CHECK (artist_pct BETWEEN 0 AND 100),
  valid_from  date NOT NULL DEFAULT current_date,
  valid_to    date,
  validation text NOT NULL DEFAULT 'pendiente' CHECK (validation IN ('pendiente', 'validado'))
);


CREATE TABLE appointments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          uuid REFERENCES leads(id),
  client_id        uuid NOT NULL REFERENCES clients(id),
  artist_id        uuid NOT NULL REFERENCES artists(id),
  location_id      uuid NOT NULL REFERENCES locations(id),
  service_id       uuid REFERENCES services(id),
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'reservada' CHECK (status IN ('reservada', 'confirmada', 'realizada', 'cancelada', 'no_show')),
  client_origin text NOT NULL DEFAULT 'estudio' CHECK (client_origin IN ('artista', 'estudio')),
  price_quoted     numeric(10,2),
  deposit_amount   numeric(10,2) DEFAULT 0,
  price_final      numeric(10,2),
  payment_method text CHECK (payment_method IN ('efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro')),
  artist_pct       numeric(5,2),               -- snapshot al realizar
  artist_amount    numeric(10,2),
  studio_amount    numeric(10,2),
  completed_at     timestamptz,
  work_description text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (status <> 'realizada' OR (price_final IS NOT NULL AND payment_method IS NOT NULL))
);
CREATE INDEX appt_artist_time_idx   ON appointments (artist_id, starts_at);
CREATE INDEX appt_location_time_idx ON appointments (location_id, starts_at);
ALTER TABLE appointments ADD CONSTRAINT appt_no_overlap
  EXCLUDE USING gist (artist_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status IN ('reservada', 'confirmada'));

-- Fotos del trabajo = historial y portfolio del cliente
CREATE TABLE work_photos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  file           uuid NOT NULL,                -- directus_files.id
  taken_at       timestamptz DEFAULT now(),
  publish_ok     boolean NOT NULL DEFAULT false
);

-- Ventas sueltas (piercing, joyería, cuidados...) con comisión al vendedor
CREATE TABLE sales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id    uuid NOT NULL REFERENCES locations(id),
  artist_id      uuid REFERENCES artists(id),  -- NULL = mostrador
  client_id      uuid REFERENCES clients(id),
  service_id     uuid REFERENCES services(id),
  concept        text NOT NULL,
  amount         numeric(10,2) NOT NULL CHECK (amount >= 0),
  payment_method text NOT NULL CHECK (payment_method IN ('efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro')),
  artist_pct     numeric(5,2),
  artist_amount  numeric(10,2),
  sold_at        timestamptz NOT NULL DEFAULT now()
);

-- Consentimiento informado. Contiene DATOS DE SALUD (art. 9 RGPD):
-- respuestas cifradas con pgp_sym_encrypt; la clave vive fuera de la BD.
-- Texto y cuestionario PENDIENTES de validación legal/sanitaria.
CREATE TABLE consent_forms (
  id             serial PRIMARY KEY,
  version        text NOT NULL,
  languages_code varchar(8) NOT NULL REFERENCES languages(code),
  body           text NOT NULL,
  questions      jsonb NOT NULL,
  validation text NOT NULL DEFAULT 'pendiente' CHECK (validation IN ('pendiente', 'validado')),
  UNIQUE (version, languages_code)
);
CREATE TABLE consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES clients(id),
  appointment_id  uuid REFERENCES appointments(id),
  form_id         int NOT NULL REFERENCES consent_forms(id),
  answers_enc     bytea NOT NULL,
  signature_file  uuid,                        -- carpeta privada de Directus
  signed_at       timestamptz NOT NULL DEFAULT now(),
  retention_until date                         -- PENDIENTE: plazo legal
);

-- Mensajería (felicitaciones, recordatorios, campañas) vía n8n
CREATE TABLE message_log (
  id         bigserial PRIMARY KEY,
  client_id  uuid REFERENCES clients(id) ON DELETE SET NULL,
  channel    text NOT NULL CHECK (channel IN ('whatsapp', 'email', 'sms')),
  kind       text NOT NULL,                    -- 'cumpleanos', 'recordatorio', 'campana'
  payload    jsonb,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  status     text NOT NULL DEFAULT 'enviado'
);
