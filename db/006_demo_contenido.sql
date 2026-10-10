-- =====================================================================
-- 006 · Contenido de DEMO para la web y el CRM.
-- Textos genéricos redactados para enseñar la web al estudio. TODO queda
-- en validation = 'pendiente': el estudio lo revisa y valida en el CRM.
-- No se crean artistas, precios, reseñas ni datos que no conozcamos.
--
-- Además corrige web.faqs: antes publicaba cualquier FAQ con is_public,
-- aunque estuviera pendiente. Ahora, como el resto de vistas, solo
-- muestra lo validado salvo en modo demo (SHOW_PENDING=true).
-- =====================================================================

-- ---------- Vista pública de FAQs: respeta la validación ----------
CREATE OR REPLACE VIEW web.faqs AS
  SELECT f.id, f.sort, t.languages_code AS lang, t.question, t.answer
  FROM faqs f JOIN faqs_translations t ON t.faqs_id = f.id
  WHERE f.is_public
    AND (f.validation = 'validado' OR current_setting('mmq.show_demo', true) = 'on');

-- ---------- Servicios: descripciones (sin precio) ----------
UPDATE services_translations t SET description = v.description
FROM services s, (VALUES
  ('tattoo', 'es', 'Diseños a medida o a partir de tu idea: fine line, blackwork, realismo, lettering y más. Te asesoramos sobre tamaño, zona y estilo antes de empezar.'),
  ('tattoo', 'en', 'Custom designs or built from your idea: fine line, blackwork, realism, lettering and more. We advise you on size, placement and style before we start.'),
  ('piercing', 'es', 'Perforaciones con material estéril de un solo uso y joyería apta para piercing inicial. Te explicamos los cuidados y revisamos la cicatrización.'),
  ('piercing', 'en', 'Piercings done with sterile single-use equipment and jewellery suitable for initial piercings. We explain aftercare and check the healing.')
) AS v(slug, lang, description)
WHERE s.id = t.services_id AND s.slug = v.slug AND t.languages_code = v.lang
  AND t.description IS NULL;

-- Ambos servicios en los dos estudios
INSERT INTO location_services (location_id, service_id)
SELECT l.id, s.id FROM locations l CROSS JOIN services s
WHERE s.slug IN ('tattoo', 'piercing')
ON CONFLICT DO NOTHING;

-- ---------- Estilos (filtros del portfolio y fichas de artista) ----------
INSERT INTO styles (slug) VALUES
  ('fine-line'), ('blackwork'), ('realismo'), ('tradicional'), ('neotradicional'), ('lettering'), ('minimalista'), ('color')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO styles_translations (styles_id, languages_code, name)
SELECT s.id, v.lang, v.name FROM styles s JOIN (VALUES
  ('fine-line', 'es', 'Fine line'),           ('fine-line', 'en', 'Fine line'),
  ('blackwork', 'es', 'Blackwork'),           ('blackwork', 'en', 'Blackwork'),
  ('realismo', 'es', 'Realismo'),             ('realismo', 'en', 'Realism'),
  ('tradicional', 'es', 'Tradicional'),       ('tradicional', 'en', 'Traditional'),
  ('neotradicional', 'es', 'Neotradicional'), ('neotradicional', 'en', 'Neo-traditional'),
  ('lettering', 'es', 'Lettering'),           ('lettering', 'en', 'Lettering'),
  ('minimalista', 'es', 'Minimalista'),       ('minimalista', 'en', 'Minimalist'),
  ('color', 'es', 'Color'),                   ('color', 'en', 'Colour')
) AS v(slug, lang, name) ON v.slug = s.slug
ON CONFLICT (styles_id, languages_code) DO NOTHING;

-- ---------- FAQs (pendientes de validar) ----------
CREATE TEMP TABLE _faq (sort int, q_es text, a_es text, q_en text, a_en text) ON COMMIT DROP;
INSERT INTO _faq VALUES
  (1, '¿Cómo pido presupuesto?',
      'Rellena el formulario o escríbenos por WhatsApp con tu idea, la zona del cuerpo, el tamaño aproximado y, si tienes, alguna referencia. Te respondemos con presupuesto y disponibilidad.',
      'How do I get a quote?',
      'Fill in the form or message us on WhatsApp with your idea, the body area, the approximate size and any references. We will reply with a quote and availability.'),
  (2, '¿Necesito cita previa?',
      'Para tatuajes recomendamos reservar, sobre todo en temporada alta. Los piercings y los tatuajes pequeños se pueden hacer sin cita si hay hueco ese día.',
      'Do I need an appointment?',
      'For tattoos we recommend booking, especially in high season. Piercings and small tattoos can be done as walk-ins if there is a free slot that day.'),
  (3, '¿Hay que dejar señal?',
      'Para reservar una cita de tatuaje se pide una señal que se descuenta del precio final. Si necesitas cambiar la fecha, avísanos con antelación.',
      'Is a deposit required?',
      'A deposit is required to book a tattoo appointment and is deducted from the final price. If you need to change the date, let us know in advance.'),
  (4, '¿Qué edad mínima hay que tener?',
      'Tatuamos a mayores de 18 años con documento de identidad. Para piercing en menores, consulta las condiciones en el estudio: hace falta la presencia y autorización del padre, madre o tutor.',
      'What is the minimum age?',
      'We tattoo people aged 18 or over with a valid ID. For piercings on minors, ask at the studio: a parent or guardian must be present and give consent.'),
  (5, '¿Puedo ir a la playa o a la piscina después de tatuarme?',
      'Durante las primeras dos semanas evita el sol directo, el mar, la piscina y la sauna. Te damos las instrucciones de cuidado por escrito al terminar.',
      'Can I go to the beach or pool after getting tattooed?',
      'For the first two weeks avoid direct sun, the sea, swimming pools and saunas. We give you written aftercare instructions when we finish.'),
  (6, '¿Qué medidas de higiene seguís?',
      'Trabajamos con agujas y material de un solo uso, superficies desinfectadas y protocolos sanitarios en cada sesión.',
      'What hygiene standards do you follow?',
      'We use single-use needles and equipment, disinfected surfaces and health protocols in every session.'),
  (7, '¿En qué idiomas atendéis?',
      'Atendemos en español y en inglés.',
      'Which languages do you speak?',
      'We speak Spanish and English.');

WITH ins AS (
  INSERT INTO faqs (sort, is_public, validation)
  SELECT sort, true, 'pendiente' FROM _faq
  WHERE NOT EXISTS (SELECT 1 FROM faqs)          -- solo si aún no hay FAQs
  RETURNING id, sort
)
INSERT INTO faqs_translations (faqs_id, languages_code, question, answer)
SELECT ins.id, 'es', f.q_es, f.a_es FROM ins JOIN _faq f USING (sort)
UNION ALL
SELECT ins.id, 'en', f.q_en, f.a_en FROM ins JOIN _faq f USING (sort);
