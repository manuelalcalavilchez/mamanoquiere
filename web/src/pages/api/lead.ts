import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sql } from '../../lib/db';
import { useT } from '../../i18n';

export const prerender = false;

const PRIVACY_VERSION = process.env.PRIVACY_VERSION ?? 'PENDIENTE-v0';
const N8N_WEBHOOK = process.env.N8N_LEAD_WEBHOOK; // opcional: aviso por WhatsApp/email
const SALT = process.env.IP_HASH_SALT ?? 'cambia-esto';

const schema = z.object({
  name: z.string().trim().min(1, 'required').max(120),
  email: z.string().trim().email('invalidEmail').max(160).optional().or(z.literal('')),
  phone: z.string().trim().max(30).regex(/^[+\d\s().-]*$/, 'invalidPhone').optional().or(z.literal('')),
  service: z.enum(['tattoo', 'piercing']),
  location: z.enum(['puerto', 'beach']),
  artist: z.string().max(80).optional().or(z.literal('')),
  message: z.string().max(3000).optional(),
  body_zone: z.string().max(120).optional(),
  size: z.string().max(60).optional(),
  dates: z.string().max(200).optional(),
  lang: z.enum(['es', 'en']).default('es'),
  privacy_accepted: z.literal('true', { errorMap: () => ({ message: 'needPrivacy' }) }),
  marketing: z.literal('true').optional(),
  utm: z.string().max(500).optional(),
  website: z.string().max(0).optional(), // honeypot: debe ir vacío
  ts: z.coerce.number(),
}).refine((d) => d.email || d.phone, { message: 'needContact', path: ['email'] });

// Rate limit en memoria: 5 envíos / 10 min por IP (un solo contenedor basta)
const hits = new Map<string, number[]>();
const limited = (key: string) => {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 600_000);
  arr.push(now); hits.set(key, arr);
  return arr.length > 5;
};

export const POST: APIRoute = async ({ request, clientAddress, redirect }) => {
  const wantsJson = request.headers.get('accept')?.includes('application/json');
  const fd = await request.formData();
  const raw = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  const lang = raw.lang === 'en' ? 'en' : 'es';
  const back = (ok: boolean) => redirect(`/${lang}/?enviado=${ok ? 1 : 0}#cita`, 303);
  const fail = (status: number, fields: Record<string, string> = {}) =>
    wantsJson ? Response.json({ ok: false, fields }, { status }) : back(false);

  const day = new Date().toISOString().slice(0, 10);
  const ipHash = createHash('sha256').update(`${SALT}:${day}:${clientAddress}`).digest('hex').slice(0, 32);
  if (limited(ipHash)) return fail(429);

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const t = useT(lang);
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message === 'Required' ? t('form.required') : t(`form.${i.message}`)]));
    // Bots (honeypot o envío en < 3 s): respuesta de éxito aparente, no se guarda nada
    if ('website' in fields) return wantsJson ? Response.json({ ok: true }) : back(true);
    return fail(422, fields);
  }
  const d = parsed.data;
  if (Date.now() - d.ts < 3000) return wantsJson ? Response.json({ ok: true }) : back(true);
  if (!sql) return fail(503);

  let utm: unknown = null;
  try { utm = d.utm ? JSON.parse(d.utm) : null; } catch {}

  try {
    const payload = {
      name: d.name, email: d.email || null, phone: d.phone || null, service: d.service, location: d.location,
      artist: d.artist || null, message: d.message, body_zone: d.body_zone, size: d.size, dates: d.dates,
      lang: d.lang, utm, privacy_accepted: true, privacy_version: PRIVACY_VERSION,
      marketing: d.marketing === 'true', ip_hash: ipHash,
    };
    const [{ id }] = await sql`select web.create_lead(${sql.json(payload)}) as id`;

    if (N8N_WEBHOOK) {
      // Solo datos mínimos al webhook; el detalle se consulta en el CRM
      fetch(N8N_WEBHOOK, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: d.name, service: d.service, location: d.location, artist: d.artist || null }),
        signal: AbortSignal.timeout(4000),
      }).catch((e) => console.error('[n8n]', e.message));
    }
    return wantsJson ? Response.json({ ok: true, service: d.service, location: d.location }) : back(true);
  } catch (e) {
    console.error('[lead]', e);
    return fail(500);
  }
};
