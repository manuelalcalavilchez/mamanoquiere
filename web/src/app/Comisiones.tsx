import { useState } from "react";
import { api } from "../lib/api";
import { aCent, euros, ROLES, SERVICIOS } from "../lib/format";
import { useAuth } from "./auth";
import { Campo, Cargando, Modal, useAviso, useDatos } from "./ui";

type Regla = { id: number; tipo_servicio: string; porcentaje: number; rol: string | null; usuario_id: number | null; tienda_id: number | null };

export default function Comisiones() {
  const { equipo, tiendas, admin } = useAuth();
  const aviso = useAviso();
  const { datos: reglas, error, recargar } = useDatos(() => api<Regla[]>("/comisiones/reglas"), []);
  const [edit, setEdit] = useState<Partial<Regla> | null>(null);
  const [sim, setSim] = useState({ usuario: equipo[0]?.id ?? 0, tipo: "tatuaje", importe: "300" });
  const { datos: r } = useDatos(() => (aCent(sim.importe) ? api("/comisiones/simular", { query: { usuario_id: sim.usuario, tipo_servicio: sim.tipo, importe_cent: aCent(sim.importe) } }) : Promise.resolve(null)), [sim.usuario, sim.tipo, sim.importe]);
  const aplica = (x: Regla) => x.usuario_id ? `Persona: ${equipo.find((u) => u.id === x.usuario_id)?.nombre ?? "?"}` : x.rol ? `Rol: ${ROLES[x.rol]}` : "Todos";

  return (
    <>
      <div className="a-cab">
        <div><h1>Comisiones</h1><p>Porcentaje para el profesional. Gana la regla más concreta: persona, luego rol, luego general.</p></div>
        {admin && <button className="a-btn a-btn-p" onClick={() => setEdit({ tipo_servicio: "tatuaje", porcentaje: 70 })}>Nueva regla</button>}
      </div>
      {!reglas ? <Cargando error={error} /> : (
        <div className="a-tabla">
          <table>
            <thead><tr><th>Servicio</th><th>Aplica a</th><th>Estudio</th><th className="a-num">Profesional</th><th className="a-num">Estudio</th><th><span style={{ position: "absolute", left: -9999 }}>Acciones</span></th></tr></thead>
            <tbody>
              {reglas.map((x) => (
                <tr key={x.id}>
                  <td><strong>{SERVICIOS[x.tipo_servicio]}</strong></td>
                  <td><span className="a-chip">{aplica(x)}</span></td>
                  <td>{x.tienda_id ? tiendas.find((t) => t.id === x.tienda_id)?.nombre : "Todos"}</td>
                  <td className="a-num"><strong>{x.porcentaje} %</strong></td>
                  <td className="a-num">{100 - x.porcentaje} %</td>
                  <td className="a-num">{admin && <div className="a-fila" style={{ justifyContent: "flex-end" }}>
                    <button className="a-btn a-btn-sm" onClick={() => setEdit(x)}>Editar</button>
                    <button className="a-btn a-btn-sm a-btn-peligro" onClick={async () => { if (!confirm("¿Borrar esta regla?")) return; await api(`/comisiones/reglas/${x.id}`, { method: "DELETE" }); aviso("Regla borrada"); recargar(); }}>Borrar</button>
                  </div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="a-tarjeta" style={{ maxWidth: 680 }}>
        <h2>Simulador</h2>
        <div className="a-form">
          <Campo label="Profesional" id="su"><select id="su" value={sim.usuario} onChange={(e) => setSim({ ...sim, usuario: Number(e.target.value) })}>{equipo.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>
          <Campo label="Servicio" id="st"><select id="st" value={sim.tipo} onChange={(e) => setSim({ ...sim, tipo: e.target.value })}>{Object.entries(SERVICIOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
          <Campo label="Precio (€)" id="si"><input id="si" inputMode="decimal" value={sim.importe} onChange={(e) => setSim({ ...sim, importe: e.target.value })} /></Campo>
        </div>
        {r && <div className="a-grid">
          <div className="a-kpi"><span>Regla aplicada</span><strong>{r.porcentaje} %</strong></div>
          <div className="a-kpi"><span>Profesional</span><strong>{euros(r.profesional_cent)}</strong></div>
          <div className="a-kpi"><span>Estudio</span><strong>{euros(r.estudio_cent)}</strong></div>
        </div>}
      </section>
      {edit && <EditarRegla regla={edit} onCerrar={() => setEdit(null)} onGuardado={() => { setEdit(null); recargar(); }} />}
    </>
  );
}

function EditarRegla({ regla, onCerrar, onGuardado }: { regla: Partial<Regla>; onCerrar: () => void; onGuardado: () => void }) {
  const { equipo, tiendas } = useAuth();
  const aviso = useAviso();
  const [x, setX] = useState<any>({ ...regla, ambito: regla.usuario_id ? "usuario" : regla.rol ? "rol" : "todos" });
  const [error, setError] = useState("");
  async function guardar() {
    const datos = {
      tipo_servicio: x.tipo_servicio, porcentaje: Number(x.porcentaje), tienda_id: x.tienda_id ? Number(x.tienda_id) : null,
      rol: x.ambito === "rol" ? x.rol ?? "tatuador" : null, usuario_id: x.ambito === "usuario" ? Number(x.usuario_id ?? equipo[0]?.id) : null,
    };
    try { await api(regla.id ? `/comisiones/reglas/${regla.id}` : "/comisiones/reglas", { method: regla.id ? "PUT" : "POST", json: datos }); aviso("Regla guardada"); onGuardado(); }
    catch (e: any) { setError(e.message); }
  }
  const set = (k: string) => (e: any) => setX({ ...x, [k]: e.target.value });
  return (
    <Modal titulo={regla.id ? "Editar regla" : "Nueva regla"} onCerrar={onCerrar} pie={<><button className="a-btn" onClick={onCerrar}>Cancelar</button><button className="a-btn a-btn-p" onClick={guardar}>Guardar regla</button></>}>
      <div className="a-form">
        <Campo label="Servicio" id="ts"><select id="ts" value={x.tipo_servicio} onChange={set("tipo_servicio")}>{Object.entries(SERVICIOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <Campo label="% para el profesional" id="pc"><input id="pc" type="number" min={0} max={100} value={x.porcentaje} onChange={set("porcentaje")} /></Campo>
        <Campo label="Aplica a" id="am"><select id="am" value={x.ambito} onChange={set("ambito")}><option value="todos">Todos</option><option value="rol">Un rol</option><option value="usuario">Una persona</option></select></Campo>
        {x.ambito === "rol" && <Campo label="Rol" id="ro"><select id="ro" value={x.rol ?? "tatuador"} onChange={set("rol")}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>}
        {x.ambito === "usuario" && <Campo label="Persona" id="us"><select id="us" value={x.usuario_id ?? ""} onChange={set("usuario_id")}>{equipo.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></Campo>}
        <Campo label="Solo en el estudio" id="ti"><select id="ti" value={x.tienda_id ?? ""} onChange={set("tienda_id")}><option value="">Todos</option>{tiendas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></Campo>
      </div>
      {error && <p className="a-error" role="alert">{error}</p>}
    </Modal>
  );
}
