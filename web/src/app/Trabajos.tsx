import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { aCent, euros, hoyISO, PAGOS, SERVICIOS } from "../lib/format";
import { useAuth } from "./auth";
import { Cliente, ClienteSelector } from "./ClienteSelector";
import { Campo, Cargando, useAviso, useDatos } from "./ui";

export type Trabajo = { id: number; tienda_id: number; usuario_id: number; usuario_nombre: string; cliente_id: number | null; fecha: string; tipo_servicio: string; descripcion: string | null; importe_cent: number; forma_pago: string; porcentaje: number; profesional_cent: number; estudio_cent: number; foto_url: string | null; en_portfolio: boolean };

export default function Trabajos() {
  const { yo, tiendas, equipo, gestion, ajustes } = useAuth();
  const aviso = useAviso();
  const mods = ajustes?.modulos ?? {};
  const tipos = Object.entries(SERVICIOS).filter(([k]) => (k !== "piercing" || mods.piercing !== false) && (k !== "producto" || mods.productos !== false));
  const vacio = { tipo: "tatuaje", importe: "", pago: "tarjeta", descripcion: "", portfolio: true };
  const [f, setF] = useState(vacio);
  const [profesional, setProfesional] = useState<number>(yo!.id);
  const [tienda, setTienda] = useState<number>(yo?.tienda_id ?? tiendas[0]?.id);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [reparto, setReparto] = useState<{ porcentaje: number; profesional_cent: number; estudio_cent: number } | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const hoy = hoyISO();
  const { datos: lista, error: errLista, recargar } = useDatos(() => api<Trabajo[]>("/trabajos", { query: { desde: hoy, hasta: hoy, tienda_id: tienda } }), [tienda]);

  useEffect(() => {
    const cent = aCent(f.importe);
    if (!cent) { setReparto(null); return; }
    const t = setTimeout(() => api("/comisiones/simular", { query: { usuario_id: profesional, tipo_servicio: f.tipo, importe_cent: cent, tienda_id: tienda } })
      .then(setReparto).catch(() => setReparto(null)), 250);
    return () => clearTimeout(t);
  }, [f.importe, f.tipo, profesional, tienda]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cent = aCent(f.importe);
    if (!cent) { setError("Escribe el precio"); return; }
    setGuardando(true);
    try {
      const t = await api<Trabajo>("/trabajos", { method: "POST", json: {
        tienda_id: tienda, usuario_id: profesional, cliente_id: cliente?.id ?? null, tipo_servicio: f.tipo,
        importe_cent: cent, forma_pago: f.pago, descripcion: f.descripcion || null,
      } });
      if (foto) {
        const fd = new FormData();
        fd.append("foto", foto);
        await api(`/trabajos/${t.id}/foto`, { method: "POST", body: fd });
        if (f.portfolio && mods.portfolio !== false) await api(`/trabajos/${t.id}/portfolio`, { method: "PATCH", query: { publicar: true } });
      }
      aviso("Trabajo guardado");
      setF(vacio); setCliente(null); setFoto(null); recargar();
    } catch (err: any) { setError(err.message); } finally { setGuardando(false); }
  }

  return (
    <>
      <div className="a-cab"><div><h1>Trabajos</h1><p>Registra cada trabajo al terminar; el reparto se calcula solo.</p></div></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
        <form className="a-tarjeta" style={{ flex: "1 1 380px" }} onSubmit={guardar}>
          <div className="a-form">
            {gestion && (
              <Campo label="Profesional" id="pro">
                <select id="pro" value={profesional} onChange={(e) => setProfesional(Number(e.target.value))}>
                  {equipo.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </Campo>
            )}
            <Campo label="Estudio" id="ti">
              <select id="ti" value={tienda} onChange={(e) => setTienda(Number(e.target.value))}>{tiendas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select>
            </Campo>
            <Campo label="Cliente (opcional)" id="cli" ancho><ClienteSelector id="cli" valor={cliente} onCambio={setCliente} /></Campo>
            <Campo label="Servicio" ancho>
              <div className="a-seg" role="group" aria-label="Servicio">
                {tipos.map(([k, v]) => <button type="button" key={k} aria-pressed={f.tipo === k} onClick={() => setF({ ...f, tipo: k })}>{v}</button>)}
              </div>
            </Campo>
            <Campo label="Precio (€)" id="imp"><input id="imp" inputMode="decimal" value={f.importe} onChange={(e) => setF({ ...f, importe: e.target.value })} placeholder="150" /></Campo>
            <Campo label="Pago" id="pago">
              <select id="pago" value={f.pago} onChange={(e) => setF({ ...f, pago: e.target.value })}>{Object.entries(PAGOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </Campo>
            <Campo label="Descripción" id="desc" ancho><input id="desc" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} placeholder="Fine line tobillo" /></Campo>
            <Campo label="Foto del trabajo" id="foto" ancho nota="JPG, PNG o WEBP, máximo 15 MB">
              <input id="foto" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </Campo>
            {mods.portfolio !== false && (
              <label className="a-check a-ancho"><input type="checkbox" checked={f.portfolio} onChange={(e) => setF({ ...f, portfolio: e.target.checked })} />Publicar la foto en el portfolio</label>
            )}
          </div>
          {reparto && (
            <div style={{ background: "var(--tinta)", color: "#F6F4F0", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
              <small style={{ color: "#D6D3D1" }}>Reparto calculado ({reparto.porcentaje} %)</small>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Profesional</span><strong>{euros(reparto.profesional_cent)}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Estudio</span><strong>{euros(reparto.estudio_cent)}</strong></div>
            </div>
          )}
          {error && <p className="a-error" role="alert">{error}</p>}
          <button className="a-btn a-btn-p" disabled={guardando}>{guardando ? "Guardando…" : "Guardar trabajo"}</button>
        </form>
        <section style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: 10 }}>
          <h2>Hoy</h2>
          {!lista ? <Cargando error={errLista} /> : lista.length === 0 ? <div className="a-vacio">Aún no hay trabajos registrados hoy.</div> : lista.map((t) => (
            <div key={t.id} className="a-item" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {t.foto_url ? <img src={t.foto_url} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8 }} /> : null}
              <div style={{ flex: 1 }}><strong>{t.descripcion || SERVICIOS[t.tipo_servicio]}</strong><br /><small>{t.usuario_nombre} · {PAGOS[t.forma_pago]} · {t.porcentaje} %</small></div>
              <strong>{euros(t.importe_cent)}</strong>
              {gestion && <button className="a-btn a-btn-sm a-btn-peligro" onClick={async () => {
                if (!confirm("¿Anular este trabajo?")) return;
                try { await api(`/trabajos/${t.id}`, { method: "DELETE" }); aviso("Trabajo anulado"); recargar(); } catch (e: any) { aviso(e.message, true); }
              }}>Anular</button>}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
