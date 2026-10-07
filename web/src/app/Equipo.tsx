import { useState } from "react";
import { api } from "../lib/api";
import { ROLES } from "../lib/format";
import { useAuth, type Tienda, type Usuario } from "./auth";
import { Campo, iniciales, Modal, useAviso } from "./ui";

export default function Equipo() {
  const { equipo, tiendas, refrescar } = useAuth();
  const [u, setU] = useState<Partial<Usuario> | null>(null);
  const [t, setT] = useState<Tienda | null>(null);
  return (
    <>
      <div className="a-cab">
        <div><h1>Equipo y estudios</h1><p>Personas con acceso a la app y datos públicos de cada estudio.</p></div>
        <button className="a-btn a-btn-p" onClick={() => setU({ rol: "tatuador", tienda_id: tiendas[0]?.id })}>Añadir persona</button>
      </div>
      <div className="a-tabla">
        <table>
          <thead><tr><th>Persona</th><th>Rol</th><th>Estudio</th><th>Email</th><th></th></tr></thead>
          <tbody>
            {equipo.map((p) => (
              <tr key={p.id}>
                <td><div className="a-fila"><div className="a-avatar" style={p.color ? { background: p.color } : undefined}>{iniciales(p.nombre)}</div><strong>{p.nombre}</strong></div></td>
                <td>{ROLES[p.rol]}</td>
                <td>{tiendas.find((x) => x.id === p.tienda_id)?.nombre ?? "Ambos"}</td>
                <td>{p.email}</td>
                <td className="a-num"><button className="a-btn a-btn-sm" onClick={() => setU(p)}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Estudios</h2>
      <div className="a-grid">
        {tiendas.map((x) => (
          <div key={x.id} className="a-tarjeta">
            <strong>{x.nombre}</strong>
            <small style={{ color: "var(--gris)" }}>{x.direccion} · {x.telefono}</small>
            <button className="a-btn a-btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setT(x)}>Editar datos públicos</button>
          </div>
        ))}
      </div>
      {u && <EditarUsuario u={u} onCerrar={() => setU(null)} onGuardado={async () => { setU(null); await refrescar(); }} />}
      {t && <EditarTienda t={t} onCerrar={() => setT(null)} onGuardado={async () => { setT(null); await refrescar(); }} />}
    </>
  );
}

function EditarUsuario({ u, onCerrar, onGuardado }: { u: Partial<Usuario>; onCerrar: () => void; onGuardado: () => void }) {
  const { tiendas } = useAuth();
  const aviso = useAviso();
  const nuevo = !u.id;
  const [x, setX] = useState<any>({ nombre: "", email: "", color: "#17161A", bio: "", password: "", ...u });
  const [error, setError] = useState("");
  const set = (k: string) => (e: any) => setX({ ...x, [k]: e.target.value });
  async function guardar() {
    const datos: any = { nombre: x.nombre, rol: x.rol, tienda_id: x.tienda_id ? Number(x.tienda_id) : null, color: x.color, bio: x.bio || null };
    if (x.password) datos.password = x.password;
    try {
      if (nuevo) await api("/usuarios", { method: "POST", json: { ...datos, email: x.email, password: x.password } });
      else await api(`/usuarios/${u.id}`, { method: "PATCH", json: datos });
      aviso("Persona guardada");
      onGuardado();
    } catch (e: any) { setError(e.message); }
  }
  return (
    <Modal titulo={nuevo ? "Añadir persona" : x.nombre} onCerrar={onCerrar} pie={<>
      {!nuevo && <button className="a-btn a-btn-peligro" onClick={async () => { if (!confirm("¿Quitar el acceso a esta persona?")) return; await api(`/usuarios/${u.id}`, { method: "PATCH", json: { activo: false } }); aviso("Acceso retirado"); onGuardado(); }}>Quitar acceso</button>}
      <button className="a-btn" onClick={onCerrar}>Cancelar</button><button className="a-btn a-btn-p" onClick={guardar}>Guardar</button>
    </>}>
      <div className="a-form">
        <Campo label="Nombre" id="n"><input id="n" value={x.nombre} onChange={set("nombre")} /></Campo>
        <Campo label="Email" id="e"><input id="e" type="email" value={x.email} onChange={set("email")} disabled={!nuevo} /></Campo>
        <Campo label="Rol" id="r"><select id="r" value={x.rol} onChange={set("rol")}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo label="Estudio" id="t"><select id="t" value={x.tienda_id ?? ""} onChange={set("tienda_id")}><option value="">Ambos</option>{tiendas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></Campo>
        <Campo label="Color en la agenda" id="c"><input id="c" type="color" value={x.color ?? "#17161A"} onChange={set("color")} style={{ width: 64, height: 44 }} /></Campo>
        <Campo label={nuevo ? "Contraseña" : "Nueva contraseña"} id="p" nota="Mínimo 8 caracteres"><input id="p" type="password" autoComplete="new-password" value={x.password} onChange={set("password")} /></Campo>
        <Campo label="Bio para el portfolio" id="b" ancho><textarea id="b" value={x.bio ?? ""} onChange={set("bio")} /></Campo>
      </div>
      {error && <p className="a-error" role="alert">{error}</p>}
    </Modal>
  );
}

function EditarTienda({ t, onCerrar, onGuardado }: { t: Tienda; onCerrar: () => void; onGuardado: () => void }) {
  const aviso = useAviso();
  const [x, setX] = useState<any>({ ...t, abre: t.horario?.[0]?.abre ?? "11:00", cierra: t.horario?.[0]?.cierra ?? "21:00" });
  const [error, setError] = useState("");
  const set = (k: string) => (e: any) => setX({ ...x, [k]: e.target.value });
  async function guardar() {
    const { abre, cierra, id, ...resto } = x;
    const datos = { ...resto, horario: [{ dias: "Mo-Su", abre, cierra }], lat: x.lat ? Number(x.lat) : null, lng: x.lng ? Number(x.lng) : null };
    try { await api(`/tiendas/${id}`, { method: "PUT", json: datos }); aviso("Estudio guardado"); onGuardado(); } catch (e: any) { setError(e.message); }
  }
  return (
    <Modal titulo={t.nombre} onCerrar={onCerrar} pie={<><button className="a-btn" onClick={onCerrar}>Cancelar</button><button className="a-btn a-btn-p" onClick={guardar}>Guardar</button></>}>
      <div className="a-form">
        <Campo label="Nombre" id="n" ancho><input id="n" value={x.nombre} onChange={set("nombre")} /></Campo>
        <Campo label="Dirección" id="d" ancho><input id="d" value={x.direccion ?? ""} onChange={set("direccion")} /></Campo>
        <Campo label="Código postal" id="cp"><input id="cp" value={x.codigo_postal ?? ""} onChange={set("codigo_postal")} /></Campo>
        <Campo label="Localidad" id="lo"><input id="lo" value={x.localidad ?? ""} onChange={set("localidad")} /></Campo>
        <Campo label="Teléfono" id="te"><input id="te" value={x.telefono ?? ""} onChange={set("telefono")} /></Campo>
        <Campo label="WhatsApp" id="wa" nota="Con prefijo, ej. +34672912034"><input id="wa" value={x.whatsapp ?? ""} onChange={set("whatsapp")} /></Campo>
        <Campo label="Abre" id="ab"><input id="ab" type="time" value={x.abre} onChange={set("abre")} /></Campo>
        <Campo label="Cierra" id="ci"><input id="ci" type="time" value={x.cierra} onChange={set("cierra")} /></Campo>
        <Campo label="Latitud" id="la" nota="Opcional, mejora el mapa y el SEO"><input id="la" value={x.lat ?? ""} onChange={set("lat")} /></Campo>
        <Campo label="Longitud" id="ln"><input id="ln" value={x.lng ?? ""} onChange={set("lng")} /></Campo>
      </div>
      {error && <p className="a-error" role="alert">{error}</p>}
    </Modal>
  );
}
