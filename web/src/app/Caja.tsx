import { useState } from "react";
import { abrirArchivo, api } from "../lib/api";
import { euros, fechaLarga, hoyISO, PAGOS, ROLES } from "../lib/format";
import { useAuth } from "./auth";
import { Cargando, useAviso, useDatos } from "./ui";

export default function Caja() {
  const { yo, tiendas, gestion } = useAuth();
  const aviso = useAviso();
  const [fecha, setFecha] = useState(hoyISO());
  const [tienda, setTienda] = useState<number>(yo?.tienda_id ?? tiendas[0]?.id);
  const { datos: r, error, recargar } = useDatos(() => api("/caja/resumen", { query: { tienda_id: tienda, fecha } }), [tienda, fecha]);

  async function accion(metodo: "POST" | "DELETE") {
    const txt = metodo === "POST" ? "¿Cerrar la caja de este día? Después no se podrán añadir ni anular trabajos." : "¿Reabrir la caja de este día?";
    if (!confirm(txt)) return;
    try { await api("/caja/cierres", { method: metodo, query: { tienda_id: tienda, fecha } }); aviso(metodo === "POST" ? "Caja cerrada" : "Caja reabierta"); recargar(); }
    catch (e: any) { aviso(e.message, true); }
  }

  return (
    <>
      <div className="a-cab">
        <div><h1>Cierre de caja</h1><p>{fechaLarga(fecha)}{r?.cerrado ? " · cerrada" : ""}</p></div>
        <div className="a-fila">
          <div className="a-seg" role="group" aria-label="Estudio">
            {tiendas.map((t) => <button key={t.id} aria-pressed={tienda === t.id} onClick={() => setTienda(t.id)}>{t.slug === "puerto" ? "Puerto" : t.slug === "beach" ? "Beach" : t.nombre}</button>)}
          </div>
          <input type="date" aria-label="Fecha" value={fecha} onChange={(e) => setFecha(e.target.value || hoyISO())} style={{ width: 160 }} />
          {gestion && <button className="a-btn" onClick={() => abrirArchivo("/caja/export.csv", `caja_${fecha}.csv`, { tienda_id: tienda, desde: fecha, hasta: fecha })}>Exportar a Excel</button>}
          {gestion && r && (r.cerrado
            ? <button className="a-btn" onClick={() => accion("DELETE")}>Reabrir día</button>
            : <button className="a-btn a-btn-p" onClick={() => accion("POST")}>Cerrar el día</button>)}
        </div>
      </div>
      {!r ? <Cargando error={error} /> : (
        <>
          {gestion && (
            <div className="a-grid">
              <div className="a-kpi"><span>Facturado</span><strong>{euros(r.facturado_cent)}</strong></div>
              <div className="a-kpi"><span>A pagar al equipo</span><strong>{euros(r.profesionales_cent)}</strong></div>
              <div className="a-kpi"><span>Para el estudio</span><strong>{euros(r.estudio_cent)}</strong></div>
              <div className="a-kpi"><span>Por forma de pago</span><strong style={{ fontSize: 16, fontFamily: "inherit" }}>
                {Object.entries(r.por_forma_pago).map(([k, v]: any) => `${PAGOS[k]} ${euros(v)}`).join(" · ") || "—"}
              </strong></div>
            </div>
          )}
          {r.personas.length === 0 ? <div className="a-vacio">No hay trabajos este día.</div> : (
            <div className="a-tabla">
              <table>
                <thead><tr><th>Persona</th><th className="a-num">Trabajos</th><th className="a-num">Facturado</th><th className="a-num">A pagar</th><th className="a-num">Para el estudio</th></tr></thead>
                <tbody>
                  {r.personas.map((p: any) => (
                    <tr key={p.usuario_id}>
                      <td><strong>{p.nombre}</strong> <small style={{ color: "var(--gris)" }}>{ROLES[p.rol]}</small></td>
                      <td className="a-num">{p.trabajos}</td>
                      <td className="a-num">{euros(p.facturado_cent)}</td>
                      <td className="a-num"><strong>{euros(p.profesional_cent)}</strong></td>
                      <td className="a-num">{euros(p.estudio_cent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
