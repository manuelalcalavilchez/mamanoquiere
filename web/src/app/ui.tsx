import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";

/** Avisos breves ("Guardado", errores). */
const AvisoCtx = createContext<(msg: string, mal?: boolean) => void>(() => {});
export function AvisoProvider({ children }: { children: ReactNode }) {
  const [a, setA] = useState<{ msg: string; mal?: boolean } | null>(null);
  useEffect(() => {
    if (!a) return;
    const id = setTimeout(() => setA(null), 3500);
    return () => clearTimeout(id);
  }, [a]);
  return (
    <AvisoCtx.Provider value={useCallback((msg, mal) => setA({ msg, mal }), [])}>
      {children}
      {a && <div className={"a-aviso" + (a.mal ? " mal" : "")} role="status">{a.msg}</div>}
    </AvisoCtx.Provider>
  );
}
export const useAviso = () => useContext(AvisoCtx);

/** Carga datos y expone recargar(). */
export function useDatos<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    setError("");
    fn().then((d) => vivo && setDatos(d)).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { datos, error, recargar: () => setN((x) => x + 1), setDatos };
}

export function Modal({ titulo, onCerrar, children, pie }: { titulo: string; onCerrar: () => void; children: ReactNode; pie?: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", f);
    return () => document.removeEventListener("keydown", f);
  }, [onCerrar]);
  return (
    <div className="a-modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="a-modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <h2>{titulo}</h2>
        {children}
        {pie && <div className="a-modal-pie">{pie}</div>}
      </div>
    </div>
  );
}

export function Campo({ label, id, children, nota, ancho }: { label: string; id?: string; children: ReactNode; nota?: string; ancho?: boolean }) {
  return (
    <div className={"a-campo" + (ancho ? " a-ancho" : "")}>
      {id ? <label htmlFor={id}>{label}</label> : <span className="a-label">{label}</span>}
      {children}
      {nota && <small>{nota}</small>}
    </div>
  );
}

export function Cargando({ error }: { error?: string }) {
  return error ? <p className="a-error" role="alert">{error}</p> : <p style={{ color: "var(--gris)" }}>Cargando…</p>;
}

export const iniciales = (n: string) => n.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
