import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "./auth";
import { Cliente, ClienteSelector } from "./ClienteSelector";
import { Campo, useAviso } from "./ui";

type Pregunta = { id: string; texto: string; tipo?: string; detalle?: boolean; obligatoria?: boolean };

/** Pensado para pasar la tablet al cliente: preguntas configurables + firma con el dedo. */
export default function Consentimiento() {
  const { ajustes } = useAuth();
  const aviso = useAviso();
  const [params] = useSearchParams();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [datos, setDatos] = useState({ fecha_nacimiento: "", documento: "", email: "" });
  const [resp, setResp] = useState<Record<string, { valor: boolean; detalle?: string }>>({});
  const [privacidad, setPrivacidad] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState(false);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const firmado = useRef(false);
  const preguntas: Pregunta[] = ajustes?.preguntas_consentimiento ?? [];

  useEffect(() => {
    const id = params.get("cliente");
    if (id) api<Cliente>(`/clientes/${id}`).then(setCliente).catch(() => {});
  }, [params]);
  useEffect(() => {
    if (cliente) setDatos({ fecha_nacimiento: cliente.fecha_nacimiento ?? "", documento: cliente.documento ?? "", email: cliente.email ?? "" });
  }, [cliente]);

  // Firma: dibujo con puntero (dedo, lápiz o ratón)
  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const ajustar = () => {
      const r = c.getBoundingClientRect();
      c.width = r.width * devicePixelRatio;
      c.height = r.height * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
      ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#17161A";
    };
    ajustar();
    let dibujando = false;
    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const down = (e: PointerEvent) => { dibujando = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (e: PointerEvent) => { if (!dibujando) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); firmado.current = true; };
    const up = () => { dibujando = false; };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); };
  }, [cliente, hecho]);

  const borrarFirma = () => {
    const c = lienzo.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    firmado.current = false;
  };

  async function enviar() {
    setError("");
    if (!cliente) return setError("Elige el cliente");
    const faltan = preguntas.filter((p) => p.obligatoria !== false && resp[p.id] === undefined);
    if (faltan.length) return setError("Responde todas las preguntas");
    if (!firmado.current) return setError("Falta la firma");
    if (!privacidad) return setError("Hay que aceptar la política de privacidad");
    try {
      await api(`/clientes/${cliente.id}`, { method: "PUT", json: { ...cliente, fecha_nacimiento: datos.fecha_nacimiento || null, documento: datos.documento || null, email: datos.email || null } });
      await api("/consentimientos", { method: "POST", json: { cliente_id: cliente.id, respuestas: resp, firma_png: lienzo.current!.toDataURL("image/png"), acepta_privacidad: true } });
      aviso("Consentimiento firmado y guardado");
      setHecho(true);
    } catch (e: any) { setError(e.message); }
  }

  if (hecho)
    return (
      <div className="a-tarjeta" style={{ maxWidth: 560 }}>
        <h1>Gracias, {cliente?.nombre.split(" ")[0]}</h1>
        <p>El consentimiento está firmado. Devuelve la tablet al estudio.</p>
        <button className="a-btn a-btn-p" onClick={() => { setHecho(false); setCliente(null); setResp({}); setPrivacidad(false); }}>Nuevo consentimiento</button>
      </div>
    );

  return (
    <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 18 }}>
      <h1>Consentimiento informado</h1>
      <div className="a-tarjeta">
        <div className="a-form">
          <Campo label="Cliente" id="cli" ancho><ClienteSelector id="cli" valor={cliente} onCambio={setCliente} /></Campo>
          <Campo label="Fecha de nacimiento" id="fn"><input id="fn" type="date" value={datos.fecha_nacimiento} onChange={(e) => setDatos({ ...datos, fecha_nacimiento: e.target.value })} /></Campo>
          <Campo label="DNI / pasaporte" id="dni"><input id="dni" value={datos.documento} onChange={(e) => setDatos({ ...datos, documento: e.target.value })} /></Campo>
          <Campo label="Email" id="em" ancho><input id="em" type="email" value={datos.email} onChange={(e) => setDatos({ ...datos, email: e.target.value })} /></Campo>
        </div>
      </div>
      <fieldset className="a-tarjeta" style={{ margin: 0 }}>
        <legend style={{ fontWeight: 700, padding: "0 6px" }}>¿Tienes alguna de estas condiciones?</legend>
        {preguntas.map((p) => (
          <div key={p.id} style={{ borderTop: "1px solid var(--suave)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="a-fila" style={{ justifyContent: "space-between" }}>
              <span>{p.texto}</span>
              <div className="a-seg" role="group" aria-label={p.texto}>
                <button type="button" aria-pressed={resp[p.id]?.valor === false} onClick={() => setResp({ ...resp, [p.id]: { valor: false } })}>No</button>
                <button type="button" aria-pressed={resp[p.id]?.valor === true} onClick={() => setResp({ ...resp, [p.id]: { valor: true, detalle: resp[p.id]?.detalle } })}>Sí</button>
              </div>
            </div>
            {p.detalle && resp[p.id]?.valor && (
              <input aria-label={`Detalle: ${p.texto}`} placeholder="Indica cuál" value={resp[p.id]?.detalle ?? ""} onChange={(e) => setResp({ ...resp, [p.id]: { valor: true, detalle: e.target.value } })} />
            )}
          </div>
        ))}
      </fieldset>
      {ajustes?.texto_legal && <div className="a-tarjeta" style={{ whiteSpace: "pre-line", fontSize: 14, maxHeight: 220, overflowY: "auto" }}>{ajustes.texto_legal}</div>}
      <div className="a-tarjeta">
        <div className="a-fila" style={{ justifyContent: "space-between" }}><strong>Firma</strong><button type="button" className="a-btn a-btn-sm" onClick={borrarFirma}>Borrar firma</button></div>
        <canvas ref={lienzo} className="a-firma" aria-label="Zona de firma" />
        <label className="a-check"><input type="checkbox" checked={privacidad} onChange={(e) => setPrivacidad(e.target.checked)} />Acepto el tratamiento de mis datos según la política de privacidad del estudio.</label>
      </div>
      {error && <p className="a-error" role="alert">{error}</p>}
      <button className="a-btn a-btn-p" style={{ minHeight: 54 }} onClick={enviar}>Firmar y guardar</button>
    </div>
  );
}
