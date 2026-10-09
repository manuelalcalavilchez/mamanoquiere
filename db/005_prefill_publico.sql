-- =====================================================================
-- Precarga para la DEMO con datos que aparecen en directorios públicos
-- (Fresha, octubre 2026). TODO sigue en 'pendiente': el estudio debe
-- confirmarlo en el CRM antes de producción. Hay discrepancias entre
-- fuentes, anotadas en source_note.
-- =====================================================================
UPDATE businesses SET website = 'https://mamanoquiere.com', instagram = 'mamanoquiere_tattoo.ibiza' WHERE name = 'Mamanoquiere Tattoo Ibiza';

UPDATE locations SET
  street = 'Carrer de Carles III, 21', postal_code = '07800', locality = 'Eivissa',
  phone = '+34672912034',
  maps_url = 'https://www.google.com/maps/search/?api=1&query=Mamanoquiere+Tattoo+Puerto+Carrer+de+Carles+III+21+07800+Eivissa',
  opening_hours = '[{"days":["Mo","Tu","We","Th","Fr","Sa","Su"],"opens":"11:00","closes":"21:00"}]',
  source_note = 'Fresha (ficha Puerto). Horario y teléfono sin confirmar. WhatsApp desconocido.'
WHERE slug = 'puerto';

UPDATE locations SET
  street = 'Carrer del País Basc, 13', postal_code = '07800', locality = 'Eivissa',
  phone = '+34672912034',
  maps_url = 'https://www.google.com/maps/search/?api=1&query=Mamanoquiere+Tattoo+Beach+Carrer+del+Pais+Basc+13+07800+Eivissa',
  opening_hours = '[{"days":["Mo","Tu","We","Th","Fr","Sa","Su"],"opens":"12:00","closes":"21:00"}]',
  source_note = 'Fresha (ficha Beach). Otras fichas dan el teléfono +34 678 86 62 68 y horarios hasta la 1:00. Confirmar teléfono, horario y WhatsApp.'
WHERE slug = 'beach';
