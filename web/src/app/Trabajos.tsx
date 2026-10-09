import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { abrirArchivo } from "../lib/api";
import { aCent, eur2, euros, hoyISO, PAGOS, pctIva, SERVICIOS } from "../lib/format";
import { useAuth } from "./auth";
import { Cliente, ClienteSelector } from "./ClienteSelector";
import { Campo, Cargando, useAviso, useDatos } from "./ui";

export type Trabajo = { id: number; tienda_id: number; usuario_id: number; usuario_nombre: string; cliente_id: number | null; fecha: string; tipo_servicio: string; descripcion: string | null; importe_cent: number; forma_pago: string; porcentaje: number; profesional_cent: number; estudio_cent: number; foto_url: string | null; en_portfolio: boolean;
  precio_cent: number | null; descuento_cent: number; descuento_motivo: string | null; iva_x100: number | null; base_cent: number | null; cuota_iva_cent: number | null; factura_id: number | null };
type Descuento = { id: number; nombre: string; tipo: string; valor: number; solo_gestion: boolean };

export default function Trabajos() {
  const { yo, tiendas, equipo, gestion, ajustes } = useAuth();
  const aviso = useAviso();
  const mods = ajustes?.modulos ?? {};
  const tipos = Object.entries(SERVICIOS).filter(([k]) => (k !== "piercing" || mods.piercing !== false) && (k !== "producto" || mods.productos !== false));
  const vacio = { tipo: "tatuaje", importe: "", pago: "tarjeta", descripcion: "", portfolio: true, dto: "", dtoValor: "", dtoMotivo: "" };
  const [f, setF] = useState(vacio);
  const [profesional, setProfesional] = useState<number>(yo!.id);
  const [tienda, setTienda] = useState<number>(yo?.tienda_id ?? tiendas[0]?.id);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [reparto, setReparto] = useState<{ porcentaje: number; profesional_cent: number; estudio_cent: number; base_cent?: number; cuota_iva_cent?: number; iva_x100?: number; total_cent?: number } | null>(null);
  const { datos: descuentos } = useDatos(() => api<Descuento[]>("/descuentos"), []);
  const facturacion = mods.facturacion !== false;
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const hoy = hoyISO();
  const { datos: lista, error: errLista, recargar } = useDatos(() => api<Trabajo[]>("/trabajos", { query: { desde: hoy, hasta: hoy, tienda_id: tienda } }), [tienda]);

  // Descuento: "" ninguno | "pct" | "eur" | id de un descuento predefinido
  const precio = aCent(f.importe);
  const dtoPre = descuentos?.find((d) => String(d.id) === f.dto);
  const descuento = !precio ? 0
    : dtoPre ? (dtoPre.tipo === "porcentaje" ? Math.round(precio * dtoPre.valor / 100) : Math.min(dtoPre.valor, precio))
    : f.dto === "pct" ? Math.round(precio * (parseFloat(f.dtoValor.replace(",", ".")) || 0) / 100)
    : f.dto === "eur" ? Math.min(aCent(f.dtoValor), precio) : 0;

  useEffect(() => {
    const cent = precio - descuento;
    if (!precio || cent <= 0) { setReparto(null); return; }
    const t = setTimeout(() => api("/comisiones/simular", { query: { usuario_id: profesional, tipo_servicio: f.tipo, importe_cent: cent, tienda_id: tienda } })
      .then(setReparto).catch(() => setReparto(null)), 250);
    return () => clearTimeout(t);
  }, [precio, descuento, f.tipo, profesional, tienda]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cent = aCent(f.importe);
    if (!cent) { setError("Escribe el precio"); return; }
    setGuardando(true);
    try {
      const t = await api<Trabajo>("/trabajos", { method: "POST", json: {
        tienda_id: tienda, usuario_id: profesional, cliente_id: cliente?.id ?? null, tipo_servicio: f.tipo,
        precio_cent: cent, forma_pago: f.pago, descripcion: f.descripcion || null,
        descuento_id: dtoPre?.id ?? null,
        descuento_pct: f.dto === "pct" ? Math.round(parseFloat(f.dtoValor.replace(",", ".")) || 0) : null,
        descuento_cent: f.dto === "eur" ? aCent(f.dtoValor) : null,
        descuento_motivo: f.dto === "pct" || f.dto === "eur" ? f.dtoMotivo || null : null,
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
            <Campo label="Precio de tarifa (€)" id="imp"><input id="imp" inputMode="decimal" value={f.importe} onChange={(e) => setF({ ...f, importe: e.target.value })} placeholder="150" /></Campo>
            <Campo label="Pago" id="pago">
              <select id="pago" value={f.pago} onChange={(e) => setF({ ...f, pago: e.target.value })}>{Object.entries(PAGOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </Campo>
            <Campo label="Descuento" id="dto">
              <select id="dto" value={f.dto} onChange={(e) => setF({ ...f, dto: e.target.value, dtoValor: "", dtoMotivo: "" })}>
                <option value="">Sin descuento</option>
                {(descuentos ?? []).filter((d) => gestion || !d.solo_gestion).map((d) => <option key={d.id} value={d.id}>{d.nombre} ({d.tipo === "porcentaje" ? `${d.valor} %` : euros(d.valor)})</option>)}
                <option value="pct">Otro: porcentaje</option>
                <option value="eur">Otro: importe en €</option>
              </select>
            </Campo>
            {(f.dto === "pct" || f.dto === "eur") && (
              <>
                <Campo label={f.dto === "pct" ? "Descuento (%)" : "Descuento (€)"} id="dtov"><input id="dtov" inputMode="decimal" value={f.dtoValor} onChange={(e) => setF({ ...f, dtoValor: e.target.value })} /></Campo>
                <Campo label="Motivo del descuento" id="dtom"><input id="dtom" value={f.dtoMotivo} onChange={(e) => setF({ ...f, dtoMotivo: e.target.value })} placeholder="Retoque, cliente habitual…" /></Campo>
              </>
            )}
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
              {descuento > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Descuento</span><span>−{eur2(descuento)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>A cobrar</span><strong>{eur2(reparto.total_cent ?? precio - descuento)}</strong></div>
              {reparto.iva_x100 != null && <small style={{ color: "#D6D3D1" }}>Base {eur2(reparto.base_cent!)} + IVA {pctIva(reparto.iva_x100)} {eur2(reparto.cuota_iva_cent!)}</small>}
              <small style={{ color: "#D6D3D1", marginTop: 6 }}>Reparto calculado ({reparto.porcentaje} %)</small>
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
              <div style={{ flex: 1 }}><strong>{t.descripcion || SERVICIOS[t.tipo_servicio]}</strong><br /><small>{t.usuario_nombre} · {PAGOS[t.forma_pago]} · {t.porcentaje} %{t.descuento_cent ? ` · dto. ${eur2(t.descuento_cent)}` : ""}{t.factura_id ? " · facturado" : ""}</small></div>
              <strong>{euros(t.importe_cent)}</strong>
              {gestion && facturacion && !t.factura_id && <button className="a-btn a-btn-sm" onClick={async () => {
                try {
                  const fa = await api<{ id: number; num_serie: string }>("/facturas", { method: "POST", json: { tipo: "F2", tienda_id: t.tienda_id, trabajo_ids: [t.id] } });
                  aviso(`Ticket ${fa.num_serie} emitido`); recargar(); abrirArchivo(`/facturas/${fa.id}/pdf`).catch(() => {});
                } catch (e: any) { aviso(e.message, true); }
              }}>Ticket</button>}
              {gestion && !t.factura_id && <button className="a-btn a-btn-sm a-btn-peligro" onClick={async () => {
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
