import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, token } from "../lib/api";

export type Usuario = { id: number; nombre: string; email: string; rol: string; tienda_id: number | null; color: string | null; activo: boolean; bio: string | null };
export type Tienda = { id: number; nombre: string; slug: string | null; [k: string]: any };
export type Ajustes = { nombre_estudio: string; logo_url: string | null; tema: any; modulos: Record<string, boolean>; preguntas_consentimiento: any[]; texto_legal: string; moneda: string; web: any };

type Ctx = {
  yo: Usuario | null; ajustes: Ajustes | null; tiendas: Tienda[]; equipo: Usuario[]; listo: boolean;
  entrar: (email: string, pw: string) => Promise<void>; salir: () => void; refrescar: () => Promise<void>;
  gestion: boolean; admin: boolean;
};
const AuthCtx = createContext<Ctx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [yo, setYo] = useState<Usuario | null>(null);
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [equipo, setEquipo] = useState<Usuario[]>([]);
  const [listo, setListo] = useState(false);

  async function refrescar() {
    const [u, a, t, e] = await Promise.all([
      api<Usuario>("/auth/yo"), api<Ajustes>("/ajustes"), api<Tienda[]>("/tiendas"), api<Usuario[]>("/usuarios"),
    ]);
    setYo(u); setAjustes(a); setTiendas(t); setEquipo(e);
  }

  useEffect(() => {
    if (!token.get()) { setListo(true); return; }
    refrescar().catch(() => token.clear()).finally(() => setListo(true));
  }, []);

  async function entrar(email: string, pw: string) {
    const fd = new URLSearchParams({ username: email, password: pw });
    const r = await api<{ access_token: string }>("/auth/login", { method: "POST", body: fd });
    token.set(r.access_token);
    await refrescar();
  }
  function salir() {
    token.clear();
    setYo(null);
  }
  const gestion = !!yo && ["admin", "encargado"].includes(yo.rol);
  return (
    <AuthCtx.Provider value={{ yo, ajustes, tiendas, equipo, listo, entrar, salir, refrescar, gestion, admin: yo?.rol === "admin" }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

export function Protegido({ children }: { children: ReactNode }) {
  const { yo, listo } = useAuth();
  const loc = useLocation();
  if (!listo) return null;
  if (!yo) return <Navigate to="/app/login" state={{ desde: loc.pathname }} replace />;
  return <>{children}</>;
}
