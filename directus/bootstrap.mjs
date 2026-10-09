// =====================================================================
// Configura Directus sobre el esquema SQL existente. Idempotente:
// se puede ejecutar en cada despliegue.
//   DIRECTUS_URL=http://directus:8055 ADMIN_EMAIL=... ADMIN_PASSWORD=... node bootstrap.mjs
// =====================================================================
const URL_ = (process.env.DIRECTUS_URL ?? 'http://directus:8055').replace(/\/$/, '');
let token = '';

async function api(method, path, body, { ok404 = false } = {}) {
  const res = await fetch(URL_ + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (ok404 && (res.status === 404 || res.status === 403)) return null;
    throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
  }
  return json.data;
}
const log = (...a) => console.log('[bootstrap]', ...a);

async function waitForDirectus() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${URL_}/server/health`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Directus no responde');
}

// ---------------------------------------------------------------------
// Definición
// ---------------------------------------------------------------------
const choices = (...vals) => vals.map((v) => (Array.isArray(v) ? { value: v[0], text: v[1] } : { value: v, text: v.replace(/_/g, ' ') }));
const DROPDOWNS = {
  validation: choices(['pendiente', 'Pendiente de validar'], ['validado', 'Validado (se publica)']),
  'artists.status': choices(['activo', 'Activo'], ['guest', 'Guest'], ['inactivo', 'Inactivo']),
  'services.category': choices(['tattoo', 'Tattoo'], ['piercing', 'Piercing'], ['producto', 'Producto'], ['otro', 'Otro']),
  'leads.service_category': choices(['tattoo', 'Tattoo'], ['piercing', 'Piercing'], ['producto', 'Producto'], ['otro', 'Otro']),
  'leads.status': choices(['nuevo', 'Nuevo'], ['contactado', 'Contactado'], ['cita_confirmada', 'Cita confirmada'], ['realizado', 'Realizado'], ['cancelado', 'Cancelado']),
  'appointments.status': choices(['reservada', 'Reservada'], ['confirmada', 'Confirmada'], ['realizada', 'Realizada'], ['cancelada', 'Cancelada'], ['no_show', 'No vino']),
  'appointments.client_origin': choices(['estudio', 'Cliente del estudio'], ['artista', 'Cliente propio del artista']),
  'appointments.payment_method': choices('efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro'),
  'sales.payment_method': choices('efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro'),
  'commission_rules.applies_to': choices(['servicio_cliente_artista', 'Servicio · cliente del artista'], ['servicio_cliente_estudio', 'Servicio · cliente del estudio'], ['venta', 'Venta']),
  'message_log.channel': choices('whatsapp', 'email', 'sms'),
};
const STATUS_COLORS = {
  'leads.status': { nuevo: '#6644FF', contactado: '#3399FF', cita_confirmada: '#2ECDA7', realizado: '#A2B5CD', cancelado: '#E35169' },
  'appointments.status': { reservada: '#3399FF', confirmada: '#2ECDA7', realizada: '#A2B5CD', cancelada: '#E35169', no_show: '#FFA439' },
};

const GROUPS = [
  { collection: 'g_crm', icon: 'support_agent', es: 'CRM', sort: 1 },
  { collection: 'g_caja', icon: 'point_of_sale', es: 'Caja', sort: 2 },
  { collection: 'g_web', icon: 'public', es: 'Contenido web', sort: 3 },
  { collection: 'g_sistema', icon: 'settings', es: 'Sistema', sort: 9, collapse: 'closed' },
];
// [colección, grupo, icono, nombre ES, plantilla, oculta]
const COLLECTIONS = [
  ['leads', 'g_crm', 'inbox', 'Solicitudes (leads)', '{{full_name}} · {{status}}'],
  ['clients', 'g_crm', 'person', 'Clientes', '{{full_name}}'],
  ['appointments', 'g_crm', 'event', 'Citas', '{{starts_at}} · {{client_id.full_name}}'],
  ['work_photos', 'g_crm', 'photo_camera', 'Fotos de trabajos', '{{taken_at}}'],
  ['consents', 'g_crm', 'verified_user', 'Consentimientos', '{{signed_at}} · {{client_id.full_name}}'],
  ['message_log', 'g_crm', 'chat', 'Mensajes enviados', '{{kind}} · {{sent_at}}'],
  ['sales', 'g_caja', 'shopping_bag', 'Ventas', '{{concept}} · {{amount}}'],
  ['cierre_ubicacion', 'g_caja', 'store', 'Cierre diario por estudio', '{{dia}} · {{location_id.name}}'],
  ['cierre_artista', 'g_caja', 'badge', 'Cierre diario por artista', '{{dia}} · {{artist_id.display_name}}'],
  ['commission_rules', 'g_caja', 'percent', 'Reglas de reparto', '{{applies_to}} · {{artist_pct}}%'],
  ['artists', 'g_web', 'brush', 'Artistas', '{{display_name}}'],
  ['artist_gallery', 'g_web', 'collections', 'Galería / portfolio', '{{caption}}'],
  ['services', 'g_web', 'sell', 'Servicios', '{{slug}}'],
  ['styles', 'g_web', 'style', 'Estilos', '{{slug}}'],
  ['locations', 'g_web', 'location_on', 'Estudios', '{{name}}'],
  ['faqs', 'g_web', 'help', 'Preguntas frecuentes', '{{id}}'],
  ['reviews_summary', 'g_web', 'star', 'Reseñas (resumen)', '{{source}} · {{rating}}'],
  ['businesses', 'g_web', 'business', 'Negocio', '{{name}}'],
  ['consent_forms', 'g_sistema', 'description', 'Formularios de consentimiento', '{{version}} · {{languages_code}}'],
  ['languages', 'g_sistema', 'translate', 'Idiomas', '{{name}}'],
  ['tags', 'g_sistema', 'label', 'Etiquetas', '{{slug}}'],
  ['lead_status_history', 'g_sistema', 'history', 'Historial de estados', '{{to_status}} · {{changed_at}}'],
  ...['artist_styles', 'artist_services', 'artist_locations', 'lead_tags', 'location_services',
      'artists_translations', 'services_translations', 'styles_translations', 'faqs_translations']
    .map((c) => [c, 'g_sistema', 'link', c, null, true]),
];
// Campos de fichero (uuid) → relación con directus_files
const FILE_FIELDS = [['artists', 'portrait'], ['artist_gallery', 'file'], ['work_photos', 'file'], ['consents', 'signature_file']];
const USER_FIELDS = [['leads', 'assigned_to'], ['artists', 'directus_user']];
// Traducciones: [padre, tabla, fk al padre]
const TRANSLATIONS = [
  ['artists', 'artists_translations', 'artists_id'],
  ['services', 'services_translations', 'services_id'],
  ['styles', 'styles_translations', 'styles_id'],
  ['faqs', 'faqs_translations', 'faqs_id'],
];
// M2M: [padre, alias, junction, fk padre, fk otro, otra colección]
const M2M = [
  ['artists', 'styles', 'artist_styles', 'artist_id', 'style_id', 'styles'],
  ['artists', 'services', 'artist_services', 'artist_id', 'service_id', 'services'],
  ['artists', 'locations', 'artist_locations', 'artist_id', 'location_id', 'locations'],
  ['leads', 'tags', 'lead_tags', 'lead_id', 'tag_id', 'tags'],
];
// O2M: [padre, alias, hijo, fk]
const O2M = [
  ['artists', 'gallery', 'artist_gallery', 'artist_id'],
  ['clients', 'appointments', 'appointments', 'client_id'],
  ['clients', 'leads', 'leads', 'client_id'],
  ['appointments', 'photos', 'work_photos', 'appointment_id'],
  ['leads', 'history', 'lead_status_history', 'lead_id'],
];
const READONLY = {
  appointments: ['artist_pct', 'artist_amount', 'studio_amount', 'completed_at', 'created_at', 'updated_at'],
  sales: ['artist_pct', 'artist_amount'],
  leads: ['privacy_accepted_at', 'privacy_version', 'source', 'utm', 'created_at', 'updated_at'],
  consents: ['answers_enc', 'signed_at'],
};
const HIDDEN = { leads: ['ip_hash'], consents: ['answers_enc'], artists: ['business_id'], services: ['business_id'], locations: ['business_id'] };
const TEMPLATES = {
  artists: '{{display_name}}', locations: '{{name}}', clients: '{{full_name}}', leads: '{{full_name}}', services: '{{slug}}',
  styles: '{{slug}}', tags: '{{slug}}', languages: '{{name}}', businesses: '{{name}}', appointments: '{{starts_at}}',
  consent_forms: '{{version}}', directus_users: '{{first_name}} {{last_name}}',
};

// ---------------------------------------------------------------------
async function upsertCollection(collection, meta, schemaNull = false) {
  const exists = await api('GET', `/collections/${collection}`, null, { ok404: true });
  if (!exists && schemaNull) return api('POST', '/collections', { collection, meta, schema: null });
  return api('PATCH', `/collections/${collection}`, { meta });
}
const patchField = (c, f, meta) => api('PATCH', `/fields/${c}/${f}`, { meta });
async function ensureAlias(collection, field, meta) {
  const ex = await api('GET', `/fields/${collection}/${field}`, null, { ok404: true });
  if (ex) return patchField(collection, field, meta);
  return api('POST', `/fields/${collection}`, { field, type: 'alias', meta, schema: null });
}
// Las FKs reales ya existen en SQL; las relaciones nuevas (ficheros/usuarios) se
// registran solo como metadatos (schema: null) para no alterar tablas desde Directus.
async function ensureRelation(collection, field, related_collection, meta = {}) {
  const ex = await api('GET', `/relations/${collection}/${field}`, null, { ok404: true });
  if (ex) return api('PATCH', `/relations/${collection}/${field}`, { collection, field, related_collection, meta });
  return api('POST', '/relations', { collection, field, related_collection, meta, schema: null });
}
async function findOne(path, filter) {
  const q = new URLSearchParams({ limit: '1' });
  for (const [k, v] of Object.entries(filter)) q.set(`filter[${k}][_eq]`, v);
  return (await api('GET', `${path}?${q}`))?.[0];
}

async function main() {
  await waitForDirectus();
  const auth = await api('POST', '/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  token = auth.access_token;
  log('sesión iniciada');

  // Carpetas
  const folders = {};
  for (const name of ['web-publica', 'privado']) {
    folders[name] = (await findOne('/folders', { name }))?.id ?? (await api('POST', '/folders', { name })).id;
  }
  log('carpetas', folders);

  // Grupos y colecciones
  for (const g of GROUPS) {
    await upsertCollection(g.collection, { icon: g.icon, sort: g.sort, collapse: g.collapse ?? 'open', translations: [{ language: 'es-ES', translation: g.es }] }, true);
  }
  let i = 0;
  for (const [collection, group, icon, es, display_template, hidden] of COLLECTIONS) {
    await upsertCollection(collection, { group, icon, display_template, hidden: !!hidden, sort: ++i, translations: [{ language: 'es-ES', translation: es }] });
  }
  log('colecciones', COLLECTIONS.length);

  // Desplegables
  const all = await api('GET', '/fields?limit=-1');
  for (const f of all.filter((f) => f.field === 'validation' && !f.collection.startsWith('directus_'))) {
    await patchField(f.collection, 'validation', { interface: 'select-dropdown', options: { choices: DROPDOWNS.validation }, display: 'labels', width: 'half' });
  }
  for (const [key, ch] of Object.entries(DROPDOWNS)) {
    if (!key.includes('.')) continue;
    const [c, f] = key.split('.');
    const colors = STATUS_COLORS[key];
    await patchField(c, f, {
      interface: 'select-dropdown', options: { choices: ch }, width: 'half',
      display: 'labels', display_options: colors ? { choices: ch.map((x) => ({ ...x, foreground: '#FFFFFF', background: colors[x.value] })) } : null,
    });
  }

  // Ficheros y usuarios
  for (const [c, f] of FILE_FIELDS) {
    await ensureRelation(c, f, 'directus_files');
    await patchField(c, f, { interface: 'file-image', display: 'image', special: ['file'] });
  }
  for (const [c, f] of USER_FIELDS) {
    await ensureRelation(c, f, 'directus_users');
    await patchField(c, f, { interface: 'select-dropdown-m2o', special: ['m2o'], display: 'user' });
  }

  // M2O a partir de las FKs existentes
  const relations = await api('GET', '/relations?limit=-1');
  for (const r of relations) {
    if (!r.related_collection || r.collection.startsWith('directus_') || r.related_collection === 'directus_files' || r.related_collection === 'directus_users') continue;
    const tpl = TEMPLATES[r.related_collection] ?? '{{id}}';
    await patchField(r.collection, r.field, { interface: 'select-dropdown-m2o', special: ['m2o'], options: { template: tpl }, display: 'related-values', display_options: { template: tpl } });
  }

  // Traducciones (ES/EN y los idiomas que se añadan)
  for (const [parent, table, fk] of TRANSLATIONS) {
    await ensureAlias(parent, 'translations', { special: ['translations'], interface: 'translations', options: { languageField: 'name', defaultLanguage: 'es', defaultOpenSplitView: false }, display: 'translations', display_options: { languageField: 'name', template: '{{name}}' } });
    await ensureRelation(table, fk, parent, { one_field: 'translations', junction_field: 'languages_code', sort_field: null, one_deselect_action: 'delete' });
    await ensureRelation(table, 'languages_code', 'languages', { one_field: null, junction_field: fk });
  }
  // M2M
  for (const [parent, alias, junction, fkP, fkO, other] of M2M) {
    await ensureAlias(parent, alias, { special: ['m2m'], interface: 'list-m2m', options: { template: `{{${fkO}.${(TEMPLATES[other] ?? '{{id}}').replace(/[{}]/g, '')}}}` }, display: 'related-values' });
    await ensureRelation(junction, fkP, parent, { one_field: alias, junction_field: fkO, one_deselect_action: 'delete' });
    await ensureRelation(junction, fkO, other, { one_field: null, junction_field: fkP });
  }
  // O2M
  for (const [parent, alias, child, fk] of O2M) {
    await ensureAlias(parent, alias, { special: ['o2m'], interface: 'list-o2m', display: 'related-values' });
    await ensureRelation(child, fk, parent, { one_field: alias });
  }
  // Campos calculados / ocultos
  for (const [c, fields] of Object.entries(READONLY)) for (const f of fields) await patchField(c, f, { readonly: true });
  for (const [c, fields] of Object.entries(HIDDEN)) for (const f of fields) await patchField(c, f, { hidden: true });
  for (const c of ['cierre_artista', 'cierre_ubicacion', 'lead_status_history']) {
    for (const f of all.filter((x) => x.collection === c)) await patchField(c, f.field, { readonly: true });
  }
  log('campos y relaciones');

  // --- Acceso público: solo leer ficheros de la carpeta web-publica ----
  const pubAccess = (await api('GET', '/access?filter[role][_null]=true&filter[user][_null]=true&fields=policy&limit=1'))?.[0];
  if (pubAccess) {
    const pol = pubAccess.policy;
    const have = await api('GET', `/permissions?filter[policy][_eq]=${pol}&filter[collection][_eq]=directus_files&limit=1`);
    if (!have.length) await api('POST', '/permissions', { policy: pol, collection: 'directus_files', action: 'read', fields: ['*'], permissions: { folder: { _eq: folders['web-publica'] } } });
  }

  // --- Roles ------------------------------------------------------------
  const R = (collection, action, permissions = {}, fields = ['*'], presets = null) => ({ collection, action, permissions, fields, presets });
  const crud = (c, filter = {}) => ['create', 'read', 'update'].map((a) => R(c, a, a === 'create' ? null : filter));
  const readOnly = (...cs) => cs.map((c) => R(c, 'read'));
  const mine = { artist_id: { directus_user: { _eq: '$CURRENT_USER' } } };
  const ROLES = [
    { name: 'Dirección', icon: 'admin_panel_settings', admin: true, perms: [] },
    { name: 'Recepción', icon: 'support_agent', perms: [
      ...crud('leads'), ...crud('clients'), ...crud('appointments'), ...crud('work_photos'), ...crud('sales'), ...crud('lead_tags'), ...crud('message_log'),
      R('consents', 'create'), R('consents', 'read', {}, ['id', 'client_id', 'appointment_id', 'form_id', 'signed_at']),
      ...readOnly('artists', 'artist_styles', 'artist_locations', 'artist_services', 'styles', 'locations', 'services', 'tags', 'languages',
        'cierre_ubicacion', 'cierre_artista', 'lead_status_history', 'consent_forms', 'artists_translations', 'services_translations', 'styles_translations'),
      R('directus_files', 'create'), R('directus_files', 'read'), R('directus_folders', 'read'),
    ] },
    { name: 'Artista', icon: 'brush', perms: [
      R('appointments', 'read', mine), R('appointments', 'update', mine, ['status', 'price_final', 'payment_method', 'work_description', 'notes', 'photos']),
      R('work_photos', 'create'), R('work_photos', 'read', { appointment_id: mine }),
      R('sales', 'create', null, ['location_id', 'client_id', 'service_id', 'concept', 'amount', 'payment_method', 'artist_id']),
      R('sales', 'read', mine), R('cierre_artista', 'read', mine),
      R('clients', 'read', { appointments: mine }, ['id', 'full_name', 'phone', 'email', 'notes', 'appointments']),
      R('artist_gallery', 'create'), R('artist_gallery', 'read', mine), R('artist_gallery', 'update', mine),
      ...readOnly('artists', 'locations', 'services', 'styles', 'languages'),
      R('directus_files', 'create'), R('directus_files', 'read'),
    ] },
  ];
  for (const role of ROLES) {
    let r = await findOne('/roles', { name: role.name });
    if (!r) r = await api('POST', '/roles', { name: role.name, icon: role.icon });
    let p = await findOne('/policies', { name: role.name });
    if (!p) p = await api('POST', '/policies', { name: role.name, icon: role.icon, admin_access: !!role.admin, app_access: true });
    const link = await api('GET', `/access?filter[role][_eq]=${r.id}&filter[policy][_eq]=${p.id}&limit=1`);
    if (!link.length) await api('POST', '/access', { role: r.id, policy: p.id });
    const existing = await api('GET', `/permissions?filter[policy][_eq]=${p.id}&limit=-1&fields=id`);
    if (existing.length) await api('DELETE', '/permissions', existing.map((x) => x.id));
    if (role.perms.length) await api('POST', '/permissions', role.perms.map((x) => ({ ...x, policy: p.id })));
  }
  log('roles: Dirección, Recepción, Artista');

  // --- Panel de inicio (Insights) ----------------------------------------
  let dash = await findOne('/dashboards', { name: 'Hoy en el estudio' });
  if (!dash) {
    dash = await api('POST', '/dashboards', { name: 'Hoy en el estudio', icon: 'today', color: '#8AA3B3' });
    const today = { _gte: '$NOW(-1 day)' };
    await api('POST', '/panels', [
      { dashboard: dash.id, name: 'Leads nuevos', icon: 'inbox', type: 'metric', position_x: 1, position_y: 1, width: 12, height: 6, show_header: true,
        options: { collection: 'leads', field: 'id', function: 'count', filter: { status: { _eq: 'nuevo' } } } },
      { dashboard: dash.id, name: 'Citas confirmadas', icon: 'event', type: 'metric', position_x: 13, position_y: 1, width: 12, height: 6, show_header: true,
        options: { collection: 'appointments', field: 'id', function: 'count', filter: { status: { _eq: 'confirmada' } } } },
      { dashboard: dash.id, name: 'Cobrado (24 h)', icon: 'euro', type: 'metric', position_x: 25, position_y: 1, width: 12, height: 6, show_header: true,
        options: { collection: 'cierre_ubicacion', field: 'total_cobrado', function: 'sum', filter: { dia: today }, prefix: '€ ' } },
      { dashboard: dash.id, name: 'Últimas solicitudes', icon: 'list', type: 'list', position_x: 1, position_y: 7, width: 18, height: 14, show_header: true,
        options: { collection: 'leads', displayTemplate: '{{full_name}} · {{service_category}} · {{location_id.name}}', sortField: 'created_at', sortDirection: 'desc', limit: 10 } },
      { dashboard: dash.id, name: 'Próximas citas', icon: 'schedule', type: 'list', position_x: 19, position_y: 7, width: 18, height: 14, show_header: true,
        options: { collection: 'appointments', displayTemplate: '{{starts_at}} · {{client_id.full_name}} · {{artist_id.display_name}}', sortField: 'starts_at', sortDirection: 'asc', limit: 10, filter: { starts_at: { _gte: '$NOW' } } } },
    ]);
  }
  // Nombre del proyecto en el login
  await api('PATCH', '/settings', { project_name: 'Mamanoquiere CRM', project_color: '#1C1814', default_language: 'es-ES' });
  log('listo');
}

main().catch((e) => { console.error('[bootstrap] ERROR', e.message); process.exit(1); });
