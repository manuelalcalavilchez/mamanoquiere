import type { APIRoute } from 'astro';
import { langs, useT } from '../i18n';
import { getArtists, visible } from '../lib/db';

export const GET: APIRoute = async ({ site }) => {
  const urls: string[] = [];
  for (const l of langs) {
    const t = useT(l);
    urls.push(`/${l}/`, `/${l}/${t('routes.artists')}`);
    for (const a of (await getArtists(l)).filter(visible)) urls.push(`/${l}/${t('routes.artists')}/${a.slug}`);
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    urls.map((u) => `  <url><loc>${new URL(u, site).href}</loc></url>`).join('\n')}\n</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' } });
};
