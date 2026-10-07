import { useState } from "react";
import { api } from "../lib/api";
import { ESTADOS_CITA, fechaLarga, hora, hoyISO, ROLES } from "../lib/format";
import { useAuth } from "./auth";
import { Cliente, ClienteSelector } from "./ClienteSelector";
import { Campo, Cargando, iniciales, Modal, useAviso, useDatos } from "./ui";

type Cita = { id: number; tienda_id: number; usuario_id: number; cliente_id: number; cliente_nombre: string; inicio: string; fin: string; descripcion: string | null; estado: string; senal_cent: number };
const COLOR: Record<string, string> = { reservada: "#FFFFFF", confirmada: "#FDF2F1", hecha: "#EEF2EE", no_presentado: "#F5F5F4", cancelada: "#F5F5F4" };

const mover = (iso: string, dias: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };

export default function Agenda() {
  const { yo, tiendas, equipo, gestion } = useAuth();
  const [fecha, setFecha] = useState(hoyISO());
  const [tienda, setTienda] = useState<number>(yo?.tienda_id ?? tiendas[0]?.id ?? 1);
  const [editando, setEditando] = useState<Partial<Cita> | null>(null);
  const { datos: citas, error, recargar } = useDatos(() => api<Cita[]>("/citas", { query: { desde: fecha, tienda_id: tienda } }), [fecha, tienda]);

  const profesionales = gestion
    ? equipo.filter((u) => ["tatuador", "piercer", "invitado", "encargado"].includes(u.rol) && (u.tienda_id === tienda || u.tienda_id === null))
    : equipo.filter((u) => u.id === yo?.id);

  return (
    <>
      <div className="a-cab">
        <div><h1>Agenda</h1><p>{fechaLarga(fecha)}</p></div>
        <div className="a-fila">
          <div className="a-seg" role="group" aria-label="Estudio">
            {tiendas.map((t) => <button key={t.id} aria-pressed={tienda === t.id} onClick={() => setTienda(t.id)}>{t.slug === "puerto" ? "Puerto" : t.slug === "beach" ? "Beach" : t.nombre}</button>)}
          </div>
          <button className="a-btn" aria-label="Día anterior" onClick={() => setFecha(mover(fecha, -1))}>‹</button>
          <input type="date" aria-label="Fecha" value={fecha} onChange={(e) => setFecha(e.target.value || hoyISO())} style={{ width: 160 }} />
          <button className="a-btn" aria-label="Día siguiente" onClick={() => setFecha(mover(fecha, 1))}>›</button>
          <button className="a-btn" onClick={() => setFecha(hoyISO())}>Hoy</button>
          <button className="a-btn a-btn-p" onClick={() => setEditando({ usuario_id: gestion ? profesionales[0]?.id : yo!.id, tienda_id: tienda, inicio: `${fecha}T11:00`, fin: `${fecha}T12:00`, estado: "reservada" })}>Nueva cita</button>
        </div>
      </div>
      {!citas ? <Cargando error={error} /> : profesionales.length === 0 ? (
        <div className="a-vacio">No hay profesionales en este estudio. Añádelos en Equipo y estudios.</div>
      ) : (
        <div className="a-cols">
          <div className="a-cols-in">
            {profesionales.map((p) => {
              const suyas = citas.filter((c) => c.usuario_id === p.id);
              return (
                <section key={p.id} className="a-col" aria-label={p.nombre}>
                  <div className="a-fila" style={{ gap: 10 }}>
                    <div className="a-avatar" style={p.color ? { background: p.color } : undefined}>{iniciales(p.nombre)}</div>
                    <div><strong>{p.nombre}</strong><br /><small style={{ color: "var(--gris)" }}>{ROLES[p.rol]}</small></div>
                  </div>
                  {suyas.length === 0 && <small style={{ color: "var(--gris)", padding: "0 4px" }}>Sin citas</small>}
                  {suyas.map((c) => (
                    <button key={c.id} className="a-item" style={{ background: COLOR[c.estado] }} onClick={() => setEditando(c)}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--gris2)" }}>
                        <span>{hora(c.inicio)}–{hora(c.fin)}</span><strong>{ESTADOS_CITA[c.estado]}</strong>
                      </div>
                      <strong>{c.cliente_nombre}</strong>
                      {c.descripcion && <small>{c.descripcion}</small>}
                    </button>
                  ))}
                </section>
              );
            })}
          </div>
        </div>
      )}
      {editando && <EditarCita cita={editando} profesionales={profesionales} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); recargar(); }} />}
    </>
  );
}

function EditarCita({ cita, profesionales, onCerrar, onGuardado }: { cita: Partial<Cita>; profesionales: any[]; onCerrar: () => void; onGuardado: () => void }) {
  const aviso = useAviso();
  const nueva = !cita.id;
  const [c, setC] = useState({ ...cita, inicio: cita.inicio?.slice(0, 16), fin: cita.fin?.slice(0, 16) });
  const [cliente, setCliente] = useState<Cliente | null>(cita.cliente_id ? { id: cita.cliente_id, nombre: cita.cliente_nombre!, email: null, telefono: null } : null);
  const [error, setError] = useState("");
  const set = (k: string) => (e: any) => setC({ ...c, [k]: e.target.value });

  async function guardar() {
    setError("");
    if (!cliente) { setError("Elige un cliente"); return; }
    const datos = { usuario_id: Number(c.usuario_id), inicio: c.inicio, fin: c.fin, descripcion: c.descripcion || null, estado: c.estado };
    try {
      if (nueva) await api("/citas", { method: "POST", json: { ...datos, tienda_id: c.tienda_id, cliente_id: cliente.id } });
      else await api(`/citas/${c.id}`, { method: "PATCH", json: datos });
      aviso(nueva ? "Cita creada" : "Cita guardada");
      onGuardado();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <Modal titulo={nueva ? "Nueva cita" : "Cita"} onCerrar={onCerrar} pie={<>
      <button className="a-btn" onClick={onCerrar}>Cancelar</button>
      <button className="a-btn a-btn-p" onClick={guardar}>{nueva ? "Crear cita" : "Guardar"}</button>
    </>}>
      <div className="a-form">
        <Campo label="Cliente" id="cl" ancho>{nueva ? <ClienteSelector id="cl" valor={cliente} onCambio={setCliente} /> : <strong>{cliente?.nombre}</strong>}</Campo>
        <Campo label="Profesional" id="pro">
          <select id="pro" value={c.usuario_id} onChange={set("usuario_id")}>{profesionales.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
        </Campo>
        <Campo label="Estado" id="est">
          <select id="est" value={c.estado} onChange={set("estado")}>{Object.entries(ESTADOS_CITA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Campo>
        <Campo label="Empieza" id="ini"><input id="ini" type="datetime-local" value={c.inicio} onChange={set("inicio")} /></Campo>
        <Campo label="Termina" id="fin"><input id="fin" type="datetime-local" value={c.fin} onChange={set("fin")} /></Campo>
        <Campo label="Trabajo" id="desc" ancho><input id="desc" value={c.descripcion ?? ""} onChange={set("descripcion")} placeholder="Manga brazo, sesión 2" /></Campo>
      </div>
      {error && <p className="a-error" role="alert">{error}</p>}
    </Modal>
  );
}
