import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { abrirArchivo, api } from "../lib/api";
import { ESTADOS_LEAD, fechaHora, SERVICIOS_WEB } from "../lib/format";
import { useAuth } from "./auth";
import { Campo, Cargando, Modal, useAviso, useDatos } from "./ui";

type Lead = { id: number; nombre: string; telefono: string; email: string | null; idioma: string; tienda_id: number | null; servicio: string; zona_corporal: string | null; tamano: string | null; fecha_preferida: string | null; mensaje: string | null; adjuntos: string[]; estado: string; etiquetas: string[]; asignado_a: number | null; cliente_id: number | null; notas: string | null; historial: any[]; creado: string; pagina_origen: string | null };
const ABIERTOS = ["nuevo", "contactado", "pendiente_de_respuesta", "presupuesto_enviado", "cita_propuesta", "cita_confirmada"];
const EVENTOS: Record<string, string> = { clic_whatsapp: "Clics en WhatsApp", clic_telefono: "Clics en llamar", clic_como_llegar: "Cómo llegar", envio_formulario: "Formularios enviados", abandono_formulario: "Formularios abandonados" };
const wa = (tel: string) => "https://wa.me/" + tel.replace(/\D/g, "").replace(/^(?=\d{9}$)/, "34");

export default function Solicitudes() {
  const { tiendas, gestion } = useAuth();
  const [tienda, setTienda] = useState<number | 0>(0);
  const [archivo, setArchivo] = useState(false);
  const [abierto, setAbierto] = useState<Lead | null>(null);
  const { datos: leads, error, recargar } = useDatos(() => api<Lead[]>("/leads", { query: { tienda_id: tienda || undefined, limit: 300 } }), [tienda]);
  const { datos: res } = useDatos(() => (gestion ? api("/leads/resumen") : Promise.resolve(null)), []);
  const nombreT = (id: number | null) => { const t = tiendas.find((x) => x.id === id); return t?.slug === "puerto" ? "Puerto" : t?.slug === "beach" ? "Beach" : t?.nombre ?? "Sin estudio"; };
  const cerrados = (leads ?? []).filter((l) => !ABIERTOS.includes(l.estado));

  return (
    <>
      <div className="a-cab">
        <div><h1>Solicitudes web</h1><p>Llegan desde el formulario de la web. Muévelas de columna según avanzan.</p></div>
        <div className="a-seg" role="group" aria-label="Estudio">
          <button aria-pressed={tienda === 0} onClick={() => setTienda(0)}>Todos</button>
          {tiendas.map((t) => <button key={t.id} aria-pressed={tienda === t.id} onClick={() => setTienda(t.id)}>{nombreT(t.id)}</button>)}
        </div>
      </div>
      {res && (
        <div className="a-grid">
          {Object.entries(EVENTOS).map(([k, v]) => <div key={k} className="a-kpi"><span>{v} · 30 días</span><strong>{res.eventos_web[k] ?? 0}</strong></div>)}
        </div>
      )}
      {!leads ? <Cargando error={error} /> : (
        <div className="a-cols">
          <div className="a-cols-in">
            {ABIERTOS.map((e) => {
              const col = leads.filter((l) => l.estado === e);
              return (
                <section key={e} className="a-col" aria-label={ESTADOS_LEAD[e]}>
                  <div className="a-col-cab"><strong>{ESTADOS_LEAD[e]}</strong><span>{col.length}</span></div>
                  {col.map((l) => (
                    <button key={l.id} className="a-item" onClick={() => setAbierto(l)}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{l.nombre}</strong><small>{fechaHora(l.creado, true)}</small></div>
                      <small>{SERVICIOS_WEB[l.servicio]} · {nombreT(l.tienda_id)}{l.fecha_preferida ? ` · ${l.fecha_preferida}` : ""}</small>
                      {l.mensaje && <small style={{ color: "var(--gris2)" }}>{l.mensaje.slice(0, 90)}{l.mensaje.length > 90 ? "…" : ""}</small>}
                      <div className="a-fila" style={{ gap: 4 }}>{l.etiquetas.map((t) => <span key={t} className="a-chip">{t}</span>)}{l.adjuntos.length > 0 && <span className="a-chip">{l.adjuntos.length} img</span>}</div>
                    </button>
                  ))}
                </section>
              );
            })}
          </div>
        </div>
      )}
      {cerrados.length > 0 && (
        <div>
          <button className="a-btn" aria-expanded={archivo} onClick={() => setArchivo(!archivo)}>{archivo ? "Ocultar" : "Ver"} archivadas ({cerrados.length})</button>
          {archivo && (
            <div className="a-tabla" style={{ marginTop: 10 }}>
              <table><thead><tr><th>Nombre</th><th>Servicio</th><th>Estado</th><th>Fecha</th></tr></thead>
                <tbody>{cerrados.map((l) => <tr key={l.id} onClick={() => setAbierto(l)} style={{ cursor: "pointer" }}><td><strong>{l.nombre}</strong></td><td>{SERVICIOS_WEB[l.servicio]}</td><td>{ESTADOS_LEAD[l.estado]}</td><td>{fechaHora(l.creado, true)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {abierto && <DetalleLead lead={abierto} nombreT={nombreT} onCerrar={() => setAbierto(null)} onCambio={() => { setAbierto(null); recargar(); }} />}
    </>
  );
}

function DetalleLead({ lead, nombreT, onCerrar, onCambio }: { lead: Lead; nombreT: (id: number | null) => string; onCerrar: () => void; onCambio: () => void }) {
  const { equipo, gestion } = useAuth();
  const aviso = useAviso();
  const nav = useNavigate();
  const [estado, setEstado] = useState(lead.estado);
  const [asignado, setAsignado] = useState<number | "">(lead.asignado_a ?? "");
  const [notas, setNotas] = useState(lead.notas ?? "");
  const [error, setError] = useState("");

  async function guardar() {
    try {
      await api(`/leads/${lead.id}`, { method: "PATCH", json: { estado, notas: notas || null, ...(gestion ? { asignado_a: asignado || null } : {}) } });
      aviso("Solicitud actualizada");
      onCambio();
    } catch (e: any) { setError(e.message); }
  }
  async function convertir() {
    try { const c = await api(`/leads/${lead.id}/convertir`, { method: "POST" }); aviso("Cliente creado"); nav(`/app/clientes/${c.id}`); }
    catch (e: any) { setError(e.message); }
  }

  return (
    <Modal titulo={lead.nombre} onCerrar={onCerrar} pie={<>
      <button className="a-btn" onClick={convertir}>{lead.cliente_id ? "Ver cliente" : "Crear cliente"}</button>
      <button className="a-btn a-btn-p" onClick={guardar}>Guardar</button>
    </>}>
      <div className="a-fila">
        <a className="a-btn" href={wa(lead.telefono)} target="_blank" rel="noopener">WhatsApp</a>
        <a className="a-btn" href={"tel:" + lead.telefono.replace(/\s/g, "")}>Llamar {lead.telefono}</a>
        {lead.email && <a className="a-btn" href={"mailto:" + lead.email}>Email</a>}
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px", margin: 0 }}>
        <dt>Servicio</dt><dd style={{ margin: 0 }}>{SERVICIOS_WEB[lead.servicio]}</dd>
        <dt>Estudio</dt><dd style={{ margin: 0 }}>{nombreT(lead.tienda_id)}</dd>
        {lead.zona_corporal && <><dt>Zona</dt><dd style={{ margin: 0 }}>{lead.zona_corporal}</dd></>}
        {lead.tamano && <><dt>Tamaño</dt><dd style={{ margin: 0 }}>{lead.tamano}</dd></>}
        {lead.fecha_preferida && <><dt>Fecha preferida</dt><dd style={{ margin: 0 }}>{lead.fecha_preferida}</dd></>}
        <dt>Idioma</dt><dd style={{ margin: 0 }}>{lead.idioma.toUpperCase()}</dd>
        <dt>Recibida</dt><dd style={{ margin: 0 }}>{fechaHora(lead.creado, true)}</dd>
      </dl>
      {lead.mensaje && <p style={{ margin: 0, whiteSpace: "pre-line", background: "var(--fondo)", padding: 12, borderRadius: 8 }}>{lead.mensaje}</p>}
      {lead.adjuntos.length > 0 && (
        <div className="a-fila">
          {lead.adjuntos.map((a, i) => <button key={a} className="a-btn a-btn-sm" onClick={() => abrirArchivo(`/leads/${lead.id}/adjuntos/${a}`)}>Referencia {i + 1}</button>)}
        </div>
      )}
      <div className="a-form">
        <Campo label="Estado" id="es">
          <select id="es" value={estado} onChange={(e) => setEstado(e.target.value)}>{Object.entries(ESTADOS_LEAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Campo>
        {gestion && (
          <Campo label="Asignada a" id="as">
            <select id="as" value={asignado} onChange={(e) => setAsignado(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Nadie</option>
              {equipo.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </Campo>
        )}
        <Campo label="Notas internas" id="no" ancho><textarea id="no" value={notas} onChange={(e) => setNotas(e.target.value)} /></Campo>
      </div>
      {lead.historial.length > 0 && <small style={{ color: "var(--gris)" }}>{lead.historial.map((h) => `${ESTADOS_LEAD[h.a]} (${fechaHora(h.en, true)})`).join(" → ")}</small>}
      {error && <p className="a-error" role="alert">{error}</p>}
    </Modal>
  );
}
