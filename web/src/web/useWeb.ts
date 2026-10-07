import { useEffect, useState } from "react";
import { api } from "../lib/api";

export type Ubicacion = {
  id: number; slug: string; nombre: string; direccion: string; codigo_postal: string; localidad: string;
  telefono: string; whatsapp_url: string | null; horario: { dias: string; abre: string; cierra: string }[];
  servicios: string[]; google_maps: string; apple_maps: string; schema_org: any;
};
export type WebConfig = { nombre: string; logo_url: string | null; tema: any; web: any; servicios: string[] };

let cache: { cfg: WebConfig; ubis: Ubicacion[] } | null = null;
let promesa: Promise<{ cfg: WebConfig; ubis: Ubicacion[] }> | null = null;

function cargar() {
  promesa ??= Promise.all([api<WebConfig>("/publico/web"), api<Ubicacion[]>("/publico/ubicaciones")])
    .then(([cfg, ubis]) => (cache = { cfg, ubis }))
    .catch((e) => { promesa = null; throw e; });
  return promesa;
}

export function useWeb() {
  const [datos, setDatos] = useState(cache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!cache) cargar().then(setDatos).catch(() => setError(true));
  }, []);
  return { cfg: datos?.cfg, ubis: datos?.ubis ?? [], error };
}

export const telHref = (t?: string) => (t ? "tel:" + t.replace(/\s/g, "") : "#");
export const isMovil = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
