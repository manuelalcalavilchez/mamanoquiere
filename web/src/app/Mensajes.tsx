import { useState } from "react";
import { api } from "../lib/api";
import { fechaHora } from "../lib/format";
import { Campo, Cargando, useAviso, useDatos } from "./ui";

export default function Mensajes() {
  const aviso = useAviso();
  const [canal, setCanal] = useState<"whatsapp" | "email">("whatsapp");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("Hola {nombre}, ");
  const [prev, setPrev] = useState<{ destinatarios: number; ejemplo: string } | null>(null);
  const [error, setError] = useState("");
  const { datos: hist, error: eh, recargar } = useDatos(() => api<any[]>("/mensajes"), []);
  const datos = { canal, asunto: canal === "email" ? asunto : null, cuerpo };

  async function previsualizar() {
    setError("");
    try { setPrev(await api("/mensajes/previsualizar", { method: "POST", json: datos })); } catch (e: any) { setError(e.message); }
  }
  async function enviar() {
    if (!prev || !confirm(`¿Enviar a ${prev.destinatarios} clientes?`)) return;
    try { await api("/mensajes", { method: "POST", json: datos }); aviso("Envío en marcha"); setPrev(null); recargar(); }
    catch (e: any) { setError(e.message); }
  }

  return (
    <>
      <div className="a-cab"><div><h1>Mensajes</h1><p>Solo se envía a clientes que aceptaron recibir comunicaciones.</p></div></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
        <div className="a-tarjeta" style={{ flex: "3 1 420px" }}>
          <Campo label="Canal">
            <div className="a-seg" role="group" aria-label="Canal">
              <button aria-pressed={canal === "whatsapp"} onClick={() => { setCanal("whatsapp"); setPrev(null); }}>WhatsApp</button>
              <button aria-pressed={canal === "email"} onClick={() => { setCanal("email"); setPrev(null); }}>Email</button>
            </div>
          </Campo>
          {canal === "email" && <Campo label="Asunto" id="as"><input id="as" value={asunto} onChange={(e) => { setAsunto(e.target.value); setPrev(null); }} /></Campo>}
          <Campo label="Mensaje" id="cu" nota="{nombre} se sustituye por el nombre de cada cliente.">
            <textarea id="cu" rows={6} value={cuerpo} onChange={(e) => { setCuerpo(e.target.value); setPrev(null); }} />
          </Campo>
          {error && <p className="a-error" role="alert">{error}</p>}
          <div className="a-fila" style={{ justifyContent: "flex-end" }}>
            <button className="a-btn" onClick={previsualizar}>Ver destinatarios</button>
            <button className="a-btn a-btn-p" disabled={!prev || prev.destinatarios === 0} onClick={enviar}>{prev ? `Enviar a ${prev.destinatarios} clientes` : "Enviar"}</button>
          </div>
          {prev && <div style={{ background: canal === "whatsapp" ? "#E7E1D8" : "var(--fondo)", padding: 16, borderRadius: 12 }}>
            <div style={{ background: canal === "whatsapp" ? "#DCF5D0" : "#fff", padding: "10px 14px", borderRadius: 10, maxWidth: 360, whiteSpace: "pre-line" }}>{prev.ejemplo}</div>
          </div>}
        </div>
        <section style={{ flex: "2 1 300px", display: "flex", flexDirection: "column", gap: 10 }}>
          <h2>Envíos anteriores</h2>
          {!hist ? <Cargando error={eh} /> : hist.length === 0 ? <div className="a-vacio">Todavía no se ha enviado nada.</div> : hist.map((m) => (
            <div key={m.id} className="a-item">
              <strong>{m.asunto || m.cuerpo.slice(0, 50)}</strong>
              <small>{m.canal === "email" ? "Email" : "WhatsApp"} · {fechaHora(m.creado, true)} · {m.enviados}/{m.destinatarios} enviados{m.fallidos ? ` · ${m.fallidos} fallidos` : ""}</small>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
