import { defineMiddleware } from 'astro:middleware';
const STAGING = process.env.SHOW_PENDING === 'true';
// La demo (datos pendientes + fotos importadas) nunca se indexa.
export const onRequest = defineMiddleware(async (_ctx, next) => {
  const res = await next();
  if (STAGING) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
});
