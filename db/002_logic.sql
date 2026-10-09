-- =====================================================================
-- Lógica de negocio en BD (fuente única: vale igual para Directus,
-- la web, n8n o una futura app de artistas).
-- =====================================================================

-- updated_at automático --------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['businesses','locations','artists','clients','leads','appointments'] LOOP
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);
  END LOOP;
END $$;

-- Embudo de leads: nuevo → contactado → cita_confirmada → realizado | cancelado
CREATE OR REPLACE FUNCTION lead_status_guard() RETURNS trigger AS $$
DECLARE ok boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO lead_status_history (lead_id, from_status, to_status) VALUES (NEW.id, NULL, NEW.status);
    RETURN NEW;
  END IF;
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  ok := (OLD.status, NEW.status) IN (
    ('nuevo','contactado'), ('nuevo','cancelado'),
    ('contactado','cita_confirmada'), ('contactado','cancelado'),
    ('cita_confirmada','realizado'), ('cita_confirmada','cancelado'),
    ('cancelado','nuevo')                       -- reabrir
  );
  IF NOT ok THEN
    RAISE EXCEPTION 'Transición de lead no permitida: % → %', OLD.status, NEW.status;
  END IF;
  INSERT INTO lead_status_history (lead_id, from_status, to_status) VALUES (NEW.id, OLD.status, NEW.status);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER leads_status AFTER INSERT ON leads FOR EACH ROW EXECUTE FUNCTION lead_status_guard();
CREATE TRIGGER leads_status_upd BEFORE UPDATE OF status ON leads FOR EACH ROW EXECUTE FUNCTION lead_status_guard();

-- Regla de comisión vigente (excepción del artista > regla general) ------
CREATE OR REPLACE FUNCTION commission_pct(p_artist uuid, p_applies text, p_at date)
RETURNS numeric AS $$
  SELECT artist_pct FROM commission_rules
  WHERE applies_to = p_applies
    AND (artist_id = p_artist OR artist_id IS NULL)
    AND valid_from <= p_at AND (valid_to IS NULL OR valid_to >= p_at)
  ORDER BY (artist_id IS NULL), valid_from DESC
  LIMIT 1
$$ LANGUAGE sql STABLE;

-- Al marcar una cita como realizada se congela el reparto -----------------
CREATE OR REPLACE FUNCTION appointment_settle() RETURNS trigger AS $$
DECLARE pct numeric;
BEGIN
  IF NEW.status = 'realizada' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'realizada') THEN
    pct := commission_pct(NEW.artist_id,
             CASE NEW.client_origin WHEN 'artista' THEN 'servicio_cliente_artista'
                                    ELSE 'servicio_cliente_estudio' END,
             NEW.starts_at::date);
    IF pct IS NULL THEN RAISE EXCEPTION 'No hay regla de comisión vigente para esta cita'; END IF;
    NEW.artist_pct    := pct;
    NEW.artist_amount := round(NEW.price_final * pct / 100, 2);
    NEW.studio_amount := NEW.price_final - NEW.artist_amount;
    NEW.completed_at  := coalesce(NEW.completed_at, now());
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER appointments_settle BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointment_settle();

-- Cita realizada → lead asociado pasa a 'realizado' si estaba confirmado --
CREATE OR REPLACE FUNCTION appointment_closes_lead() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'realizada' AND NEW.lead_id IS NOT NULL THEN
    UPDATE leads SET status = 'realizado' WHERE id = NEW.lead_id AND status = 'cita_confirmada';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER appointments_close_lead AFTER INSERT OR UPDATE OF status ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointment_closes_lead();

-- Ventas: comisión del vendedor -------------------------------------------
CREATE OR REPLACE FUNCTION sale_settle() RETURNS trigger AS $$
BEGIN
  IF NEW.artist_id IS NOT NULL THEN
    NEW.artist_pct := coalesce(NEW.artist_pct, commission_pct(NEW.artist_id, 'venta', NEW.sold_at::date), 0);
    NEW.artist_amount := round(NEW.amount * NEW.artist_pct / 100, 2);
  ELSE
    NEW.artist_pct := 0; NEW.artist_amount := 0;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER sales_settle BEFORE INSERT OR UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION sale_settle();

-- =====================================================================
-- Cierre diario (hora de Ibiza). Directus las muestra como colecciones
-- de solo lectura; n8n puede enviarlas por WhatsApp/email cada noche.
-- =====================================================================
CREATE OR REPLACE VIEW v_movimientos AS
  SELECT (a.completed_at AT TIME ZONE 'Europe/Madrid')::date AS dia,
         a.location_id, a.artist_id, 'servicio'::text AS tipo, a.payment_method,
         a.price_final AS cobrado, a.artist_amount AS para_artista,
         a.price_final - a.artist_amount AS para_estudio
  FROM appointments a WHERE a.status = 'realizada'
  UNION ALL
  SELECT (s.sold_at AT TIME ZONE 'Europe/Madrid')::date, s.location_id, s.artist_id, 'venta',
         s.payment_method, s.amount, s.artist_amount, s.amount - s.artist_amount
  FROM sales s;

CREATE OR REPLACE VIEW v_cierre_artista AS
  SELECT dia, location_id, artist_id,
         count(*) FILTER (WHERE tipo = 'servicio') AS servicios,
         count(*) FILTER (WHERE tipo = 'venta')    AS ventas,
         sum(cobrado)       AS total_cobrado,
         sum(para_artista)  AS total_artista,
         sum(para_estudio)  AS total_estudio,
         sum(cobrado) FILTER (WHERE payment_method = 'efectivo') AS efectivo,
         sum(cobrado) FILTER (WHERE payment_method = 'tarjeta')  AS tarjeta,
         sum(cobrado) FILTER (WHERE payment_method NOT IN ('efectivo','tarjeta')) AS otros
  FROM v_movimientos WHERE artist_id IS NOT NULL
  GROUP BY dia, location_id, artist_id;

CREATE OR REPLACE VIEW v_cierre_ubicacion AS
  SELECT dia, location_id,
         sum(cobrado)      AS total_cobrado,
         sum(para_artista) AS total_artistas,
         sum(para_estudio) AS total_estudio,
         sum(cobrado) FILTER (WHERE payment_method = 'efectivo') AS efectivo_en_caja,
         sum(cobrado) FILTER (WHERE payment_method = 'tarjeta')  AS tarjeta,
         sum(cobrado) FILTER (WHERE payment_method NOT IN ('efectivo','tarjeta')) AS otros
  FROM v_movimientos GROUP BY dia, location_id;

-- Directus no muestra vistas: se materializan en tablas que se recalculan
-- automáticamente tras cada cambio en citas o ventas (volumen de un estudio: trivial).
CREATE TABLE cierre_artista (
  id serial PRIMARY KEY, dia date NOT NULL, location_id uuid REFERENCES locations(id), artist_id uuid REFERENCES artists(id),
  servicios int, ventas int, total_cobrado numeric(10,2), total_artista numeric(10,2), total_estudio numeric(10,2),
  efectivo numeric(10,2), tarjeta numeric(10,2), otros numeric(10,2)
);
CREATE TABLE cierre_ubicacion (
  id serial PRIMARY KEY, dia date NOT NULL, location_id uuid REFERENCES locations(id),
  total_cobrado numeric(10,2), total_artistas numeric(10,2), total_estudio numeric(10,2),
  efectivo_en_caja numeric(10,2), tarjeta numeric(10,2), otros numeric(10,2)
);
CREATE OR REPLACE FUNCTION refresh_cierres() RETURNS trigger AS $$
BEGIN
  DELETE FROM cierre_artista;   INSERT INTO cierre_artista   (dia, location_id, artist_id, servicios, ventas, total_cobrado, total_artista, total_estudio, efectivo, tarjeta, otros) SELECT * FROM v_cierre_artista;
  DELETE FROM cierre_ubicacion; INSERT INTO cierre_ubicacion (dia, location_id, total_cobrado, total_artistas, total_estudio, efectivo_en_caja, tarjeta, otros) SELECT * FROM v_cierre_ubicacion;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER appointments_cierres AFTER INSERT OR UPDATE OR DELETE ON appointments FOR EACH STATEMENT EXECUTE FUNCTION refresh_cierres();
CREATE TRIGGER sales_cierres        AFTER INSERT OR UPDATE OR DELETE ON sales        FOR EACH STATEMENT EXECUTE FUNCTION refresh_cierres();

-- Historial de cliente
CREATE OR REPLACE VIEW v_historial_cliente AS
  SELECT a.client_id, a.id AS appointment_id, a.starts_at, a.status,
         ar.display_name AS artista, l.name AS ubicacion,
         a.work_description, a.price_final,
         (SELECT count(*) FROM work_photos w WHERE w.appointment_id = a.id) AS fotos
  FROM appointments a
  JOIN artists ar  ON ar.id = a.artist_id
  JOIN locations l ON l.id = a.location_id;

-- =====================================================================
-- API pública mínima para la web (rol sin acceso a tablas del CRM)
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS web;

CREATE OR REPLACE VIEW web.artists AS
  SELECT a.id, a.slug, a.display_name, a.status, a.guest_from, a.guest_until,
         a.instagram, a.portrait, a.sort, a.validation,
         coalesce(json_agg(DISTINCT st.slug) FILTER (WHERE st.slug IS NOT NULL), '[]') AS styles,
         coalesce(json_agg(DISTINCT l.slug)  FILTER (WHERE l.slug  IS NOT NULL), '[]') AS locations,
         coalesce(json_agg(DISTINCT se.category) FILTER (WHERE se.category IS NOT NULL), '[]') AS categories
  FROM artists a
  LEFT JOIN artist_styles ast   ON ast.artist_id = a.id
  LEFT JOIN styles st           ON st.id = ast.style_id
  LEFT JOIN artist_locations al ON al.artist_id = a.id
  LEFT JOIN locations l         ON l.id = al.location_id
  LEFT JOIN artist_services asv ON asv.artist_id = a.id
  LEFT JOIN services se         ON se.id = asv.service_id
  WHERE a.is_public AND a.status IN ('activo','guest')
    AND (a.status <> 'guest' OR a.guest_until IS NULL OR a.guest_until >= current_date)
  GROUP BY a.id;

CREATE OR REPLACE VIEW web.artists_i18n AS
  SELECT artists_id AS artist_id, languages_code AS lang, headline, bio FROM artists_translations;

-- Fotos demo (importadas de Instagram) solo si la sesión pide modo staging:
-- la web lo activa con el parámetro de conexión mmq.show_demo=on (SHOW_PENDING=true).
CREATE OR REPLACE VIEW web.gallery AS
  SELECT g.id, g.artist_id, g.file, g.width, g.height,
         coalesce(g.alt_es, 'Trabajo de Mamanoquiere Tattoo Ibiza') AS alt_es,
         coalesce(g.alt_en, g.alt_es, 'Work by Mamanoquiere Tattoo Ibiza') AS alt_en,
         g.is_featured, g.sort, s.slug AS style
  FROM artist_gallery g
  LEFT JOIN artists a ON a.id = g.artist_id
  LEFT JOIN styles s ON s.id = g.style_id
  WHERE (g.artist_id IS NULL OR a.is_public)
    AND ((g.is_public AND g.client_publication_ok)
         OR (g.demo AND current_setting('mmq.show_demo', true) = 'on'));

CREATE OR REPLACE VIEW web.styles AS
  SELECT s.slug, t.languages_code AS lang, t.name
  FROM styles s JOIN styles_translations t ON t.styles_id = s.id;

CREATE OR REPLACE VIEW web.services AS
  SELECT s.slug, s.category, s.price_from, s.duration_min, s.sort, s.validation,
         t.languages_code AS lang, t.name, t.description, t.price_note
  FROM services s JOIN services_translations t ON t.services_id = s.id
  WHERE s.is_public;

CREATE OR REPLACE VIEW web.locations AS
  SELECT slug, name, street, postal_code, locality, region, country, lat, lng,
         phone, whatsapp, email, maps_url, opening_hours, seasonal_note, sort, validation
  FROM locations
  WHERE validation = 'validado' OR current_setting('mmq.show_demo', true) = 'on'
  UNION ALL   -- sin datos validados, la web muestra igualmente los dos estudios por nombre
  SELECT slug, name, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, sort, validation
  FROM locations
  WHERE NOT (validation = 'validado' OR current_setting('mmq.show_demo', true) = 'on');

CREATE OR REPLACE VIEW web.business AS
  SELECT name, website, instagram, email, validation FROM businesses
  WHERE validation = 'validado' OR current_setting('mmq.show_demo', true) = 'on';

CREATE OR REPLACE VIEW web.reviews AS
  SELECT l.slug AS location, r.source, r.rating, r.review_count, r.source_url, r.fetched_at
  FROM reviews_summary r JOIN locations l ON l.id = r.location_id
  WHERE r.validation = 'validado' AND r.fetched_at IS NOT NULL;

CREATE OR REPLACE VIEW web.faqs AS
  SELECT f.id, f.sort, t.languages_code AS lang, t.question, t.answer
  FROM faqs f JOIN faqs_translations t ON t.faqs_id = f.id
  WHERE f.is_public;

-- Alta de lead desde el formulario: única puerta de escritura de la web.
CREATE OR REPLACE FUNCTION web.create_lead(p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_loc uuid; v_artist uuid; v_cat text; t text;
BEGIN
  IF coalesce((p->>'privacy_accepted')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'privacy_not_accepted';
  END IF;
  SELECT id INTO v_loc    FROM locations WHERE slug = p->>'location';
  SELECT id INTO v_artist FROM artists   WHERE slug = p->>'artist' AND is_public;
  v_cat := nullif(p->>'service', '');

  INSERT INTO leads (full_name, email, phone, service_category, location_id, artist_id,
                     message, body_zone, approx_size, preferred_dates, language, source, utm,
                     privacy_accepted_at, privacy_version, marketing_consent, ip_hash)
  VALUES (left(p->>'name', 120), nullif(p->>'email',''), nullif(p->>'phone',''), v_cat, v_loc, v_artist,
          left(p->>'message', 3000), left(p->>'body_zone', 120), left(p->>'size', 60),
          left(p->>'dates', 200), p->>'lang', 'web', p->'utm',
          now(), p->>'privacy_version', coalesce((p->>'marketing')::boolean, false), p->>'ip_hash')
  RETURNING id INTO v_id;

  -- Etiquetas automáticas: servicio, ubicación, origen
  FOREACH t IN ARRAY ARRAY[p->>'service', p->>'location', 'web'] LOOP
    IF t IS NOT NULL AND t <> '' THEN
      INSERT INTO tags (slug) VALUES (t) ON CONFLICT (slug) DO NOTHING;
      INSERT INTO lead_tags (lead_id, tag_id) SELECT v_id, id FROM tags WHERE slug = t;
    END IF;
  END LOOP;

  PERFORM pg_notify('new_lead', v_id::text);
  RETURN v_id;
END $$;

-- Roles ---------------------------------------------------------------------
-- La contraseña se fija en el despliegue (ver README): ALTER ROLE web_app PASSWORD '...';
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'web_app') THEN
    CREATE ROLE web_app LOGIN;
  END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM web_app;
GRANT USAGE ON SCHEMA web TO web_app;
GRANT SELECT ON ALL TABLES IN SCHEMA web TO web_app;
REVOKE ALL ON FUNCTION web.create_lead(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION web.create_lead(jsonb) TO web_app;
