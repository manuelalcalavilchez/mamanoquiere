import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { abrirArchivo, api } from "../lib/api";
import { ESTADOS_CITA, euros, fechaHora, SERVICIOS } from "../lib/format";
import { useAuth } from "./auth";
import { Cliente } from "./ClienteSelector";
import { Campo, Cargando, Modal, useAviso, useDatos } from "./ui";

export function Clientes() {
  const [q, setQ] = useState("");
  const [buscar, setBuscar] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const nav = useNavigate();
  useEffect(() => { const t = setTimeout(() => setBuscar(q), 250); return () => clearTimeout(t); }, [q]);
  const { datos, error } = useDatos(() => api<Cliente[]>("/clientes", { query: { q: buscar, limit: 100 } }), [buscar]);
  return (
    <>
      <div className="a-cab">
        <h1>Clientes</h1>
        <div className="a-fila">
          <input type="search" aria-label="Buscar clientes" placeholder="Buscar por nombre, teléfono o email" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 300 }} />
          <button className="a-btn a-btn-p" onClick={() => setNuevo(true)}>Nuevo cliente</button>
        </div>
      </div>
      {!datos ? <Cargando error={error} /> : datos.length === 0 ? <div className="a-vacio">{buscar ? "Ningún cliente coincide con la búsqueda." : "Aún no hay clientes. Se crean al registrar citas, trabajos o solicitudes web."}</div> : (
        <div className="a-tabla">
          <table>
            <thead><tr><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Comunicaciones</th></tr></thead>
            <tbody>
              {datos.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/app/clientes/${c.id}`}><strong>{c.nombre}</strong></Link></td>
                  <td>{c.telefono ?? "—"}</td><td>{c.email ?? "—"}</td>
                  <td>{c.acepta_comunicaciones ? "Sí" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nuevo && <EditarCliente onCerrar={() => setNuevo(false)} onGuardado={(c) => nav(`/app/clientes/${c.id}`)} />}
    </>
  );
}

function EditarCliente({ cliente, onCerrar, onGuardado }: { cliente?: Cliente; onCerrar: () => void; onGuardado: (c: Cliente) => void }) {
  const aviso = useAviso();
  const [c, setC] = useState<any>(cliente ?? { nombre: "", telefono: "", email: "", fecha_nacimiento: "", documento: "", acepta_comunicaciones: false, notas: "" });
  const [error, setError] = useState("");
  const set = (k: string) => (e: any) => setC({ ...c, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  async function guardar() {
    try {
      const datos = { ...c, email: c.email || null, telefono: c.telefono || null, fecha_nacimiento: c.fecha_nacimiento || null, documento: c.documento || null, notas: c.notas || null };
      const r = await api<Cliente>(cliente ? `/clientes/${cliente.id}` : "/clientes", { method: cliente ? "PUT" : "POST", json: datos });
      aviso("Cliente guardado");
      onGuardado(r);
    } catch (e: any) { setError(e.message); }
  }
  return (
    <Modal titulo={cliente ? "Editar cliente" : "Nuevo cliente"} onCerrar={onCerrar} pie={<><button className="a-btn" onClick={onCerrar}>Cancelar</button><button className="a-btn a-btn-p" onClick={guardar}>Guardar</button></>}>
      <div className="a-form">
        <Campo label="Nombre" id="n" ancho><input id="n" value={c.nombre} onChange={set("nombre")} /></Campo>
        <Campo label="Teléfono" id="t"><input id="t" type="tel" value={c.telefono ?? ""} onChange={set("telefono")} /></Campo>
        <Campo label="Email" id="e"><input id="e" type="email" value={c.email ?? ""} onChange={set("email")} /></Campo>
        <Campo label="Fecha de nacimiento" id="f"><input id="f" type="date" value={c.fecha_nacimiento ?? ""} onChange={set("fecha_nacimiento")} /></Campo>
        <Campo label="DNI / pasaporte" id="d"><input id="d" value={c.documento ?? ""} onChange={set("documento")} /></Campo>
        <Campo label="Notas" id="no" ancho><textarea id="no" value={c.notas ?? ""} onChange={set("notas")} /></Campo>
        <label className="a-check a-ancho"><input type="checkbox" checked={c.acepta_comunicaciones} onChange={set("acepta_comunicaciones")} />Acepta recibir comunicaciones</label>
      </div>
      {error && <p className="a-error" role="alert">{error}</p>}
    </Modal>
  );
}

export function ClienteDetalle() {
  const { id } = useParams();
  const { admin, equipo } = useAuth();
  const aviso = useAviso();
  const nav = useNavigate();
  const [editar, setEditar] = useState(false);
  const { datos: c, error, recargar } = useDatos(() => api<Cliente>(`/clientes/${id}`), [id]);
  const { datos: h } = useDatos(() => api(`/clientes/${id}/historial`), [id]);
  const nombre = (uid: number) => equipo.find((u) => u.id === uid)?.nombre ?? "";
  if (!c) return <Cargando error={error} />;
  return (
    <>
      <div className="a-cab">
        <div><h1>{c.nombre}</h1><p>{[c.telefono, c.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}</p></div>
        <div className="a-fila">
          <Link className="a-btn" to={`/app/consentimiento?cliente=${c.id}`}>Firmar consentimiento</Link>
          <button className="a-btn" onClick={() => setEditar(true)}>Editar</button>
          {admin && <button className="a-btn a-btn-peligro" onClick={async () => {
            if (!confirm("Se borrarán sus datos personales (derecho de supresión). Los trabajos quedan para la contabilidad. ¿Continuar?")) return;
            await api(`/clientes/${c.id}`, { method: "DELETE" }); aviso("Datos del cliente eliminados"); nav("/app/clientes");
          }}>Eliminar datos</button>}
        </div>
      </div>
      {c.notas && <div className="a-tarjeta">{c.notas}</div>}
      {!h ? <Cargando /> : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <section className="a-tarjeta" style={{ flex: "2 1 420px" }}>
            <h2>Trabajos</h2>
            {h.trabajos.length === 0 && <small style={{ color: "var(--gris)" }}>Sin trabajos registrados.</small>}
            {h.trabajos.map((t: any) => (
              <div key={t.id} className="a-fila" style={{ borderTop: "1px solid var(--suave)", paddingTop: 10 }}>
                {t.foto_url ? <img src={t.foto_url} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} /> : null}
                <div style={{ flex: 1 }}><strong>{t.descripcion || SERVICIOS[t.tipo_servicio]}</strong><br /><small style={{ color: "var(--gris)" }}>{t.fecha} · {nombre(t.usuario_id)}</small></div>
                <strong>{euros(t.importe_cent)}</strong>
              </div>
            ))}
            <h2 style={{ marginTop: 10 }}>Citas</h2>
            {h.citas.length === 0 && <small style={{ color: "var(--gris)" }}>Sin citas.</small>}
            {h.citas.map((ci: any) => <div key={ci.id}><small>{fechaHora(ci.inicio)} · {nombre(ci.usuario_id)} · {ESTADOS_CITA[ci.estado]}</small></div>)}
          </section>
          <section className="a-tarjeta" style={{ flex: "1 1 260px" }}>
            <h2>Consentimientos</h2>
            {h.consentimientos.length === 0 && <small style={{ color: "var(--gris)" }}>Ninguno firmado.</small>}
            {h.consentimientos.map((k: any) => (
              <button key={k.id} className="a-btn" style={{ justifyContent: "space-between" }} onClick={() => abrirArchivo(`/consentimientos/${k.id}/pdf`)}>
                {fechaHora(k.creado, true)}<span>PDF</span>
              </button>
            ))}
          </section>
        </div>
      )}
      {editar && <EditarCliente cliente={c} onCerrar={() => setEditar(false)} onGuardado={() => { setEditar(false); recargar(); }} />}
    </>
  );
}
