import { useEffect, useState } from "react";
import { api } from "../lib/api";

export type Cliente = { id: number; nombre: string; email: string | null; telefono: string | null; [k: string]: any };

/** Busca un cliente o lo crea en el momento con nombre y teléfono. */
export function ClienteSelector({ valor, onCambio, id = "cliente" }: { valor: Cliente | null; onCambio: (c: Cliente | null) => void; id?: string }) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<Cliente[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [tel, setTel] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (valor || q.trim().length < 2) { setLista([]); return; }
    const t = setTimeout(() => api<Cliente[]>("/clientes", { query: { q, limit: 8 } }).then(setLista).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, valor]);

  if (valor)
    return (
      <div className="a-fila">
        <strong>{valor.nombre}</strong>
        <span style={{ color: "var(--gris)" }}>{valor.telefono}</span>
        <button type="button" className="a-btn a-btn-sm" onClick={() => onCambio(null)}>Cambiar</button>
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input id={id} placeholder="Buscar por nombre, teléfono o email" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {lista.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {lista.map((c) => (
            <button type="button" key={c.id} className="a-item" onClick={() => onCambio(c)}>
              <strong>{c.nombre}</strong>
              <small>{[c.telefono, c.email].filter(Boolean).join(" · ")}</small>
            </button>
          ))}
        </div>
      )}
      {!nuevo ? (
        <button type="button" className="a-btn a-btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setNuevo(true)}>Cliente nuevo</button>
      ) : (
        <div className="a-fila">
          <input aria-label="Teléfono del cliente nuevo" placeholder="Teléfono" value={tel} onChange={(e) => setTel(e.target.value)} style={{ flex: 1 }} />
          <button type="button" className="a-btn a-btn-sm" onClick={async () => {
            if (q.trim().length < 2) { setError("Escribe el nombre en el buscador"); return; }
            try { onCambio(await api<Cliente>("/clientes", { method: "POST", json: { nombre: q.trim(), telefono: tel || null } })); }
            catch (e: any) { setError(e.message); }
          }}>Crear «{q || "…"}»</button>
        </div>
      )}
      {error && <p className="a-error">{error}</p>}
    </div>
  );
}
