// URL pública de la web en tiempo de ejecución (no de build): así la misma imagen
// sirve para demo y producción cambiando solo SITE_URL en Easypanel.
export function siteUrl(requestUrl: URL): URL {
  const env = process.env.SITE_URL;
  return new URL(env && env.startsWith('http') ? env : requestUrl.origin);
}
export const runtimeEnv = (key: string): string | undefined => process.env[key] || undefined;
