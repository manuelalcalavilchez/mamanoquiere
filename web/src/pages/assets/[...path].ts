import type { APIRoute } from 'astro';

// Reenvía /assets/<uuid>?width=…&format=webp a Directus (interno). Así la web solo
// necesita su propio dominio para las imágenes. Directus aplica sus permisos:
// el rol público solo puede leer la carpeta "web-publica".
export const prerender = false;
const TARGET = (process.env.DIRECTUS_INTERNAL_URL || '').replace(/\/$/, '');
const SAFE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/[\w.-]{1,120})?$/i;
const ALLOWED = new Set(['width', 'height', 'fit', 'format', 'quality', 'withoutEnlargement']);

export const GET: APIRoute = async ({ params, url }) => {
  const path = params.path ?? '';
  if (!TARGET || !SAFE.test(path)) return new Response(null, { status: 404 });
  const q = new URLSearchParams([...url.searchParams].filter(([k]) => ALLOWED.has(k)));
  try {
    const r = await fetch(`${TARGET}/assets/${path}${q.size ? `?${q}` : ''}`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return new Response(null, { status: r.status === 403 ? 404 : r.status });
    const headers = new Headers({
      'Content-Type': r.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    });
    const len = r.headers.get('content-length');
    if (len) headers.set('Content-Length', len);
    return new Response(r.body, { status: 200, headers });
  } catch {
    return new Response(null, { status: 502 });
  }
};
