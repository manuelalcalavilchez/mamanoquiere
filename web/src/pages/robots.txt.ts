import type { APIRoute } from 'astro';
import { siteUrl } from '../lib/site';

export const GET: APIRoute = ({ url }) => {
  const demo = process.env.SHOW_PENDING === 'true';
  const body = demo
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${new URL('/sitemap.xml', siteUrl(url)).href}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
