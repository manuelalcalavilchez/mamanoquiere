import postgres from 'postgres';
import type { Lang } from '../i18n';

const url = process.env.DATABASE_URL ?? import.meta.env.DATABASE_URL;
const SHOW_PENDING = (process.env.SHOW_PENDING ?? import.meta.env.SHOW_PENDING) === 'true';
// En staging la sesión activa mmq.show_demo: la BD devuelve datos pendientes y fotos demo.
export const sql = url
  ? postgres(url, { max: 5, idle_timeout: 30, connect_timeout: 5, connection: SHOW_PENDING ? { 'mmq.show_demo': 'on' } : {} })
  : null;
/** En producción solo se publica lo validado; en staging se ve marcado. */
export const visible = (v: { validation?: string }) => SHOW_PENDING || v.validation === 'validado';
export const showPending = SHOW_PENDING;

// Caché en memoria (60 s): los cambios del CRM aparecen en un minuto sin rebuild.
const cache = new Map<string, { at: number; data: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>, fallback: T, ttl = 60_000): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  if (!sql) return fallback;
  try {
    const data = await fn();
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    console.error('[db]', key, e);
    return (hit?.data as T) ?? fallback; // sirve lo último bueno si la BD cae
  }
}

export type Location = {
  slug: string; name: string; street: string | null; postal_code: string | null; locality: string | null;
  region: string | null; country: string | null; lat: string | null; lng: string | null;
  phone: string | null; whatsapp: string | null; email: string | null; maps_url: string | null;
  opening_hours: { days: string[]; opens: string; closes: string }[] | null;
  seasonal_note: string | null; validation: string;
};
export type Artist = {
  id: string; slug: string; display_name: string; status: 'activo' | 'guest';
  guest_from: Date | null; guest_until: Date | null; instagram: string | null; portrait: string | null;
  styles: string[]; locations: string[]; categories: string[]; validation: string;
  headline?: string | null; bio?: string | null;
};
export type Work = { id: string; artist_id: string | null; file: string; width: number | null; height: number | null; alt: string; style: string | null };
export type Service = { slug: string; category: string; price_from: string | null; name: string; description: string | null; price_note: string | null; validation: string };

// Si la BD no responde, se muestran solo los nombres conocidos de los dos estudios.
const FALLBACK_LOCATIONS = (['puerto', 'beach'] as const).map((slug) => ({
  slug, name: `Mamanoquiere Tattoo ${slug === 'puerto' ? 'Puerto' : 'Beach'}`, street: null, postal_code: null, locality: null,
  region: null, country: 'ES', lat: null, lng: null, phone: null, whatsapp: null, email: null, maps_url: null,
  opening_hours: null, seasonal_note: null, validation: 'pendiente',
})) as Location[];

export const getLocations = () =>
  cached('locations', () => sql!<Location[]>`select * from web.locations order by sort`, FALLBACK_LOCATIONS);

export const getServices = (lang: Lang) =>
  cached(`services:${lang}`, () => sql!<Service[]>`select * from web.services where lang = ${lang} order by sort`, [] as Service[]);

export const getStyles = (lang: Lang) =>
  cached(`styles:${lang}`, () => sql!<{ slug: string; name: string }[]>`select slug, name from web.styles where lang = ${lang} order by name`, []);

export const getArtists = (lang: Lang) =>
  cached(`artists:${lang}`, () => sql!<Artist[]>`
    select a.*, i.headline, i.bio from web.artists a
    left join web.artists_i18n i on i.artist_id = a.id and i.lang = ${lang}
    order by a.status, a.sort, a.display_name`, [] as Artist[]);

export const getWorks = (lang: Lang, opts: { artistId?: string; featured?: boolean; limit?: number } = {}) =>
  cached(`works:${lang}:${opts.artistId ?? ''}:${opts.featured ?? ''}:${opts.limit ?? ''}`, async () => {
    const rows = await sql!<(Work & { alt_es: string | null; alt_en: string | null })[]>`
      select * from web.gallery
      where (${opts.artistId ?? null}::uuid is null or artist_id = ${opts.artistId ?? null})
        and (${opts.featured ?? null}::boolean is null or is_featured = ${opts.featured ?? null})
      order by sort, id limit ${opts.limit ?? 60}`;
    return rows.map((r) => ({ ...r, alt: (lang === 'en' ? r.alt_en : r.alt_es) ?? r.alt_es ?? '' }));
  }, [] as Work[]);

export const getFaqs = (lang: Lang) =>
  cached(`faqs:${lang}`, () => sql!<{ id: string; question: string; answer: string }[]>`
    select id, question, answer from web.faqs where lang = ${lang} order by sort`, []);

export const getReviews = () =>
  cached('reviews', () => sql!<{ location: string; source: string; rating: string; review_count: number; source_url: string | null; fetched_at: Date }[]>`
    select * from web.reviews`, []);

export const getBusiness = () =>
  cached('business', async () => (await sql!<{ name: string; website: string | null; instagram: string | null }[]>`select * from web.business limit 1`)[0] ?? null, null as null | { name: string; website: string | null; instagram: string | null });
