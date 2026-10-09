// Imágenes servidas por Directus con transformación al vuelo (webp, ancho).
// Vacío = misma web (/assets/... se reenvía a Directus por dentro, ver pages/assets).
const base = (process.env.PUBLIC_ASSETS_URL || '').replace(/\/$/, '');
export const img = (id: string, w: number) => `${base}/assets/${id}?width=${w}&format=webp&quality=72`;
export const srcset = (id: string, widths = [400, 700, 1000, 1400]) => widths.map((w) => `${img(id, w)} ${w}w`).join(', ');
