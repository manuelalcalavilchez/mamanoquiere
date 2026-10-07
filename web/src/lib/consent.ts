// Consentimiento de cookies y eventos de conversión (solo con analítica aceptada).
export type Consent = { analitica: boolean; marketing: boolean; fecha: string };
const KEY = "mmq_consent";

export const consent = {
  get(): Consent | null {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
  },
  set(c: Omit<Consent, "fecha">) {
    localStorage.setItem(KEY, JSON.stringify({ ...c, fecha: new Date().toISOString() }));
    window.dispatchEvent(new Event("mmq-consent"));
  },
  reset() {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("mmq-consent"));
  },
};

export function track(tipo: string, extra: { tienda?: string; servicio?: string } = {}) {
  if (!consent.get()?.analitica) return;
  const lang = location.pathname.startsWith("/en") ? "en" : "es";
  fetch("/api/publico/eventos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, pagina: location.pathname, idioma: lang, ...extra }),
    keepalive: true,
  }).catch(() => {});
}
