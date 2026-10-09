-- =====================================================================
-- Semilla mínima. SOLO datos conocidos; todo lo demás NULL + 'pendiente'.
-- No se crean artistas, precios, horarios, reseñas ni textos legales.
-- =====================================================================
INSERT INTO languages (code, name) VALUES ('es', 'Español'), ('en', 'English');

WITH b AS (
  INSERT INTO businesses (name) VALUES ('Mamanoquiere Tattoo Ibiza') RETURNING id
)
INSERT INTO locations (business_id, slug, name, sort)
SELECT b.id, v.slug, v.name, v.sort FROM b,
  (VALUES ('puerto', 'Mamanoquiere Tattoo Puerto', 1), ('beach', 'Mamanoquiere Tattoo Beach', 2)) AS v(slug, name, sort);
-- PENDIENTE: dirección, coordenadas, teléfono, WhatsApp, horarios y temporada de cada local.

INSERT INTO services (business_id, slug, category, is_public, sort)
SELECT id, v.slug, v.cat, true, v.sort FROM businesses,
  (VALUES ('tattoo', 'tattoo', 1), ('piercing', 'piercing', 2)) AS v(slug, cat, sort);
INSERT INTO services_translations (services_id, languages_code, name)
SELECT s.id, v.lang, v.name FROM services s JOIN
  (VALUES ('tattoo','es','Tatuaje'), ('tattoo','en','Tattoo'),
          ('piercing','es','Piercing'), ('piercing','en','Piercing')) AS v(slug, lang, name)
  ON v.slug = s.slug;
-- PENDIENTE: descripciones, precios orientativos y duración (price_from queda NULL = no se muestra).

INSERT INTO tags (slug) VALUES ('tattoo'), ('piercing'), ('puerto'), ('beach'), ('web');

-- Reglas de reparto dictadas por el estudio en el audio (PENDIENTE confirmar por escrito):
--  · cliente propio del artista → 70 % para el artista
--  · cliente que entra por el estudio → 50 % para el artista
--  · ventas (piercing, productos) → 10 % para quien vende
INSERT INTO commission_rules (applies_to, artist_pct) VALUES
  ('servicio_cliente_artista', 70),
  ('servicio_cliente_estudio', 50),
  ('venta', 10);
