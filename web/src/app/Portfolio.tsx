import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "./auth";
import type { Trabajo } from "./Trabajos";
import { Cargando, useAviso, useDatos } from "./ui";

export default function Portfolio() {
  const { equipo, gestion, yo } = useAuth();
  const aviso = useAviso();
  const [persona, setPersona] = useState<number | 0>(gestion ? 0 : yo!.id);
  const { datos, error, setDatos } = useDatos(() => api<Trabajo[]>("/trabajos", { query: { usuario_id: persona || undefined } }), [persona]);
  const conFoto = (datos ?? []).filter((t) => t.foto_url);

  async function cambiar(t: Trabajo) {
    try {
      const r = await api<Trabajo>(`/trabajos/${t.id}/portfolio`, { method: "PATCH", query: { publicar: !t.en_portfolio } });
      setDatos(datos!.map((x) => (x.id === t.id ? { ...x, en_portfolio: r.en_portfolio } : x)));
      aviso(r.en_portfolio ? "Publicada en la web" : "Retirada de la web");
    } catch (e: any) { aviso(e.message, true); }
  }

  return (
    <>
      <div className="a-cab">
        <div><h1>Portfolio</h1><p>Las fotos marcadas como públicas salen en la web.</p></div>
        <div className="a-fila">
          {gestion && (
            <select aria-label="Filtrar por persona" value={persona} onChange={(e) => setPersona(Number(e.target.value))} style={{ width: 220 }}>
              <option value={0}>Todo el equipo</option>
              {equipo.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          )}
          <a className="a-btn" href="/#trabajos" target="_blank" rel="noopener">Ver en la web</a>
        </div>
      </div>
      {!datos ? <Cargando error={error} /> : conFoto.length === 0 ? <div className="a-vacio">Aún no hay trabajos con foto. Se suben desde Trabajos.</div> : (
        <div className="a-fotos">
          {conFoto.map((t) => (
            <figure key={t.id}>
              <img src={t.foto_url!} alt={t.descripcion ?? ""} loading="lazy" />
              <figcaption>
                <div style={{ minWidth: 0 }}><strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.descripcion || "Sin título"}</strong><span style={{ color: "var(--gris)" }}>{t.usuario_nombre}</span></div>
                <label className="a-check" style={{ minHeight: 36 }}><input type="checkbox" checked={t.en_portfolio} onChange={() => cambiar(t)} />Pública</label>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </>
  );
}
