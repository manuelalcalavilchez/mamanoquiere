import type { APIRoute } from 'astro';
// Raíz: idioma según el navegador (inglés para la mayoría de turistas)
export const GET: APIRoute = ({ request, redirect }) => {
  const al = request.headers.get('accept-language') ?? '';
  const lang = /^(es|ca|gl|eu)\b/i.test(al.trim()) ? 'es' : 'en';
  return redirect(`/${lang}/`, 302);
};
