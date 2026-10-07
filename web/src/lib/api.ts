// Cliente HTTP mínimo. La API vive en /api (Nginx la redirige al contenedor).
const BASE = "/api";
const TOKEN_KEY = "mmq_token";

export const token = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function detalle(body: any, status: number): string {
  if (!body) return `Error ${status}`;
  if (typeof body.detail === "string") return body.detail;
  if (Array.isArray(body.detail)) return body.detail.map((d: any) => d.msg).join(". ");
  return `Error ${status}`;
}

export async function api<T = any>(path: string, opts: RequestInit & { json?: unknown; query?: Record<string, any> } = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  const t = token.get();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  let body = opts.body;
  if (opts.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.json);
  }
  let url = BASE + path;
  if (opts.query) {
    const q = new URLSearchParams();
    Object.entries(opts.query).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && q.set(k, String(v)));
    if ([...q].length) url += "?" + q.toString();
  }
  const res = await fetch(url, { ...opts, headers, body });
  if (res.status === 401 && t) {
    token.clear();
    if (location.pathname.startsWith("/app")) location.assign("/app/login");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, detalle(data, res.status));
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("json") ? res.json() : res.blob()) as Promise<T>;
}

/** Abre o descarga un archivo protegido (PDF, CSV, adjunto) con el token. */
export async function abrirArchivo(path: string, nombre?: string, query?: Record<string, any>) {
  const blob = await api<Blob>(path, { query });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  if (nombre) a.download = nombre;
  else a.target = "_blank";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
