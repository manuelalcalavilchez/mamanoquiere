import { useMemo, useState } from "react";
import { abrirArchivo, api } from "../lib/api";
import { aCent, ESTADOS_ENVIO, eur2, fechaCorta, hoyISO, PAGOS, pctIva, SERVICIOS, TIPOS_FACTURA } from "../lib/format";
import { useAuth } from "./auth";
import { DatosFiscales, Verifactu } from "./FacturacionAjustes";
import type { Trabajo } from "./Trabajos";
import { Campo, Cargando, Modal, useAviso, useDatos } from "./ui";

export type Factura = {
  id: number; tienda_id: number; tipo: string; num_serie: string; fecha_expedicion: string; fecha_operacion: string | null;
  destinatario: { nombre: string; nif?: string; pais?: string; domicilio?: string } | null; cliente_id: number | null;
  descripcion: string; desglose: { iva_x100: number; base_cent: number; cuota_cent: number }[];
  base_cent: number; cuota_cent: number; total_cent: number; forma_pago: string | null; rectificada_id: number | null;
  motivo: string | null; estado: string;
  lineas: { id: number; descripcion: string; cantidad: number; precio_cent: number; descuento_cent: number; iva_x100: number; total_cent: number }[];
  verifactu: { modo: string; qr: string | null; registros: { tipo: string; huella: string; estado_envio: string }[] } | null;
};

const PESTANAS = [["facturas", "Facturas"], ["descuentos", "Descuentos"], ["iva", "IVA y libro"], ["datos", "Datos fiscales"], ["verifactu", "VERI*FACTU"]] as const;
type Pestana = typeof PESTANAS[number][0];

export default function Facturacion() {
  const { admin } = useAuth();
  const [p, setP] = useState<Pestana>("facturas");
  const visibles = PESTANAS.filter(([k]) => admin || (k !== "datos" && k !== "verifactu"));
  return (
    <>
      <div className="a-cab">
        <div><h1>Facturación</h1><p>Tickets, facturas, rectificativas, descuentos e IVA.</p></div>
      </div>
      <div className="a-seg" role="tablist" aria-label="Secciones de facturación">
        {visibles.map(([k, v]) => <button key={k} role="tab" aria-selected={p === k} aria-pressed={p === k} onClick={() => setP(k)}>{v}</button>)}
      </div>
      {p === "facturas" && <Facturas />}
      {p === "descuentos" && <Descuentos />}
      {p === "iva" && <Iva />}
      {p === "datos" && <DatosFiscales />}
      {p === "verifactu" && <Verifactu />}
    </>
  );
}

const inicioMes = () => hoyISO().slice(0, 8) + "01";
const estadoChip = (f: Factura) => {
  if (f.estado === "anulada") return <span className="a-chip" style={{ background: "#FBE4E1", color: "#A1271D" }}>Anulada</span>;
  if (f.estado === "rectificada") return <span className="a-chip">Rectificada</span>;
  return null;
};

// ------------------------------------------------------------------ facturas
function Facturas() {
  const { tiendas, admin } = useAuth();
  const aviso = useAviso();
  const [fil, setFil] = useState({ desde: inicioMes(), hasta: hoyISO(), tienda_id: "", tipo: "", q: "" });
  const { datos, error, recargar } = useDatos(() => api<Factura[]>("/facturas", { query: fil }), [fil.desde, fil.hasta, fil.tienda_id, fil.tipo, fil.q]);
  const [nueva, setNueva] = useState(false);
  const [rect, setRect] = useState<Factura | null>(null);
  const [anul, setAnul] = useState<Factura | null>(null);
  const [ver, setVer] = useState<Factura | null>(null);
  const total = (datos ?? []).filter((f) => f.estado !== "anulada").reduce((s, f) => s + f.total_cent, 0);

  return (
    <>
      <div className="a-fila">
        <input type="date" aria-label="Desde" value={fil.desde} onChange={(e) => setFil({ ...fil, desde: e.target.value })} style={{ width: 160 }} />
        <input type="date" aria-label="Hasta" value={fil.hasta} onChange={(e) => setFil({ ...fil, hasta: e.target.value })} style={{ width: 160 }} />
        <select aria-label="Estudio" value={fil.tienda_id} onChange={(e) => setFil({ ...fil, tienda_id: e.target.value })} style={{ width: 200 }}>
          <option value="">Todos los estudios</option>{tiendas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <select aria-label="Tipo" value={fil.tipo} onChange={(e) => setFil({ ...fil, tipo: e.target.value })} style={{ width: 170 }}>
          <option value="">Todos los tipos</option><option value="F2">Tickets</option><option value="F1">Facturas</option><option value="R">Rectificativas</option>
        </select>
        <input aria-label="Buscar número" placeholder="Número…" value={fil.q} onChange={(e) => setFil({ ...fil, q: e.target.value })} style={{ width: 150 }} />
        <button className="a-btn a-btn-p" style={{ marginLeft: "auto" }} onClick={() => setNueva(true)}>Nueva factura</button>
      </div>
      {!datos ? <Cargando error={error} /> : datos.length === 0 ? <div className="a-vacio">No hay facturas en estas fechas.</div> : (
        <div className="a-tabla">
          <table>
            <thead><tr><th>Número</th><th>Fecha</th><th>Tipo</th><th>Cliente</th><th className="a-num">Base</th><th className="a-num">IVA</th><th className="a-num">Total</th><th>AEAT</th><th><span style={{ position: "absolute", left: -9999 }}>Acciones</span></th></tr></thead>
            <tbody>
              {datos.map((f) => (
                <tr key={f.id} style={f.estado === "anulada" ? { color: "var(--gris)" } : undefined}>
                  <td><button className="a-btn a-btn-sm" style={{ border: 0, padding: 0, fontWeight: 700 }} onClick={() => setVer(f)}>{f.num_serie}</button> {estadoChip(f)}</td>
                  <td>{fechaCorta(f.fecha_expedicion)}</td>
                  <td><span className="a-chip">{TIPOS_FACTURA[f.tipo]}</span></td>
                  <td>{f.destinatario?.nombre ?? <small style={{ color: "var(--gris)" }}>—</small>}</td>
                  <td className="a-num">{eur2(f.base_cent)}</td>
                  <td className="a-num">{eur2(f.cuota_cent)}</td>
                  <td className="a-num"><strong>{eur2(f.total_cent)}</strong></td>
                  <td><small>{f.verifactu?.registros.length ? ESTADOS_ENVIO[f.verifactu.registros[f.verifactu.registros.length - 1].estado_envio] : "—"}</small></td>
                  <td className="a-num"><div className="a-fila" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    <button className="a-btn a-btn-sm" onClick={() => abrirArchivo(`/facturas/${f.id}/pdf`).catch((e) => aviso(e.message, true))}>PDF</button>
                    {f.estado === "emitida" && !f.tipo.startsWith("R") && <button className="a-btn a-btn-sm" onClick={() => setRect(f)}>Rectificar</button>}
                    {admin && f.estado === "emitida" && <button className="a-btn a-btn-sm a-btn-peligro" onClick={() => setAnul(f)}>Anular</button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={6} className="a-num" style={{ padding: "12px 16px" }}>Total del listado (sin anuladas)</td><td className="a-num" style={{ padding: "12px 16px" }}><strong>{eur2(total)}</strong></td><td colSpan={2} /></tr></tfoot>
          </table>
        </div>
      )}
      {nueva && <NuevaFactura onCerrar={() => setNueva(false)} onHecho={() => { setNueva(false); recargar(); }} />}
      {rect && <Rectificar f={rect} onCerrar={() => setRect(null)} onHecho={() => { setRect(null); recargar(); }} />}
      {anul && <Anular f={anul} onCerrar={() => setAnul(null)} onHecho={() => { setAnul(null); recargar(); }} />}
      {ver && <VerFactura f={ver} onCerrar={() => setVer(null)} />}
    </>
  );
}

function VerFactura({ f, onCerrar }: { f: Factura; onCerrar: () => void }) {
  return (
    <Modal titulo={`${TIPOS_FACTURA[f.tipo]} ${f.num_serie}`} onCerrar={onCerrar} pie={<button className="a-btn" onClick={onCerrar}>Cerrar</button>}>
      <p style={{ margin: 0, color: "var(--gris)" }}>{fechaCorta(f.fecha_expedicion)} · {f.descripcion}</p>
      {f.destinatario && <p style={{ margin: 0 }}><strong>{f.destinatario.nombre}</strong>{f.destinatario.nif ? ` · ${f.destinatario.nif}` : ""}{f.destinatario.domicilio ? ` · ${f.destinatario.domicilio}` : ""}</p>}
      <div className="a-tabla"><table style={{ minWidth: 0 }}>
        <tbody>{f.lineas.map((l) => <tr key={l.id}><td>{l.cantidad > 1 ? `${l.cantidad} × ` : ""}{l.descripcion}{l.descuento_cent ? <small style={{ color: "var(--gris)" }}> (−{eur2(l.descuento_cent)})</small> : null}</td><td className="a-num">{pctIva(l.iva_x100)}</td><td className="a-num">{eur2(l.total_cent)}</td></tr>)}</tbody>
      </table></div>
      {f.desglose.map((g) => <div key={g.iva_x100} className="a-fila" style={{ justifyContent: "space-between" }}><span>Base {pctIva(g.iva_x100)}: {eur2(g.base_cent)}</span><span>IVA: {eur2(g.cuota_cent)}</span></div>)}
      <div className="a-fila" style={{ justifyContent: "space-between", fontSize: 18 }}><strong>Total</strong><strong>{eur2(f.total_cent)}</strong></div>
      {f.motivo && <p style={{ margin: 0 }}><small>Motivo: {f.motivo}</small></p>}
      {f.verifactu && f.verifactu.registros.length > 0 && (
        <details><summary>Registro de facturación ({f.verifactu.modo})</summary>
          {f.verifactu.registros.map((r, i) => <p key={i} style={{ margin: "6px 0", fontSize: 12, wordBreak: "break-all" }}><strong>{r.tipo}</strong> · {ESTADOS_ENVIO[r.estado_envio]}<br />Huella {r.huella}</p>)}
          {f.verifactu.qr && <p style={{ fontSize: 12, wordBreak: "break-all" }}>QR: <a href={f.verifactu.qr} target="_blank" rel="noopener">{f.verifactu.qr}</a></p>}
        </details>
      )}
    </Modal>
  );
}

type Dest = { nombre: string; nif: string; pais: string; domicilio: string; codigo_postal: string; localidad: string };
const DEST0: Dest = { nombre: "", nif: "", pais: "ES", domicilio: "", codigo_postal: "", localidad: "" };

function CamposDestinatario({ d, setD, completa }: { d: Dest; setD: (d: Dest) => void; completa: boolean }) {
  const ext = d.pais !== "ES";
  return (
    <div className="a-form">
      <Campo label="Nombre o razón social" id="dn" ancho><input id="dn" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} /></Campo>
      <Campo label="País" id="dp"><select id="dp" value={d.pais} onChange={(e) => setD({ ...d, pais: e.target.value })}>
        {[["ES", "España"], ["GB", "Reino Unido"], ["DE", "Alemania"], ["FR", "Francia"], ["IT", "Italia"], ["NL", "Países Bajos"], ["US", "Estados Unidos"]].map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select></Campo>
      <Campo label={ext ? "Pasaporte o documento" : "NIF / DNI / NIE"} id="dnif" nota={completa ? "Obligatorio en factura completa" : undefined}><input id="dnif" value={d.nif} onChange={(e) => setD({ ...d, nif: e.target.value.toUpperCase() })} /></Campo>
      <Campo label="Domicilio" id="dd" ancho><input id="dd" value={d.domicilio} onChange={(e) => setD({ ...d, domicilio: e.target.value })} /></Campo>
      <Campo label="Código postal" id="dcp"><input id="dcp" value={d.codigo_postal} onChange={(e) => setD({ ...d, codigo_postal: e.target.value })} /></Campo>
      <Campo label="Localidad" id="dl"><input id="dl" value={d.localidad} onChange={(e) => setD({ ...d, localidad: e.target.value })} /></Campo>
    </div>
  );
}

const limpiarDest = (d: Dest) => d.nombre.trim() ? Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim() || null])) : null;

function NuevaFactura({ onCerrar, onHecho }: { onCerrar: () => void; onHecho: () => void }) {
  const { tiendas, yo } = useAuth();
  const aviso = useAviso();
  const [tienda, setTienda] = useState<number>(yo?.tienda_id ?? tiendas[0]?.id);
  const [desde, setDesde] = useState(hoyISO());
  const [tipo, setTipo] = useState<"F2" | "F1">("F2");
  const [sel, setSel] = useState<number[]>([]);
  const [lineas, setLineas] = useState<{ descripcion: string; precio: string; cantidad: string }[]>([]);
  const [dest, setDest] = useState<Dest>(DEST0);
  const [pago, setPago] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { datos: cfg } = useDatos(() => api("/facturacion/config"), []);
  const { datos: trabajos, error } = useDatos(() => api<Trabajo[]>("/trabajos", { query: { sin_factura: true, tienda_id: tienda, desde, hasta: hoyISO() } }), [tienda, desde]);

  const total = useMemo(() => (trabajos ?? []).filter((t) => sel.includes(t.id)).reduce((s, t) => s + t.importe_cent, 0)
    + lineas.reduce((s, l) => s + aCent(l.precio) * (parseInt(l.cantidad) || 1), 0), [trabajos, sel, lineas]);
  const limite = cfg?.limite_simplificada_cent ?? 40000;
  const faltanDatos = cfg && (!cfg.emisor?.nif || !cfg.emisor?.razon_social || !cfg.emisor?.domicilio);

  function marcar(t: Trabajo) {
    const nuevo = sel.includes(t.id) ? sel.filter((x) => x !== t.id) : [...sel, t.id];
    setSel(nuevo);
  }

  async function emitir() {
    setEnviando(true);
    try {
      const f = await api<Factura>("/facturas", { method: "POST", json: {
        tipo, tienda_id: tienda, trabajo_ids: sel, forma_pago: pago || null,
        lineas: lineas.filter((l) => l.descripcion && aCent(l.precio)).map((l) => ({ descripcion: l.descripcion, precio_cent: aCent(l.precio), cantidad: parseInt(l.cantidad) || 1, tipo_servicio: "producto" })),
        destinatario: limpiarDest(dest),
      } });
      aviso(`${TIPOS_FACTURA[f.tipo]} ${f.num_serie} emitida`);
      abrirArchivo(`/facturas/${f.id}/pdf`).catch(() => {});
      onHecho();
    } catch (e: any) { aviso(e.message, true); } finally { setEnviando(false); }
  }

  return (
    <Modal titulo="Nueva factura" onCerrar={onCerrar} pie={<>
      <button className="a-btn" onClick={onCerrar}>Cancelar</button>
      <button className="a-btn a-btn-p" disabled={enviando || !total || !!faltanDatos} onClick={emitir}>{enviando ? "Emitiendo…" : `Emitir ${tipo === "F2" ? "ticket" : "factura"} · ${eur2(total)}`}</button>
    </>}>
      {faltanDatos && <p className="a-error" role="alert">Faltan los datos fiscales del estudio (NIF, razón social y domicilio). Complétalos en «Datos fiscales».</p>}
      <div className="a-seg" role="group" aria-label="Tipo">
        <button aria-pressed={tipo === "F2"} onClick={() => setTipo("F2")}>Ticket (simplificada)</button>
        <button aria-pressed={tipo === "F1"} onClick={() => setTipo("F1")}>Factura completa</button>
      </div>
      {tipo === "F2" && total > limite && <p className="a-error">Más de {eur2(limite)}: la ley exige factura completa con los datos del cliente.</p>}
      <div className="a-form">
        <Campo label="Estudio" id="ft"><select id="ft" value={tienda} onChange={(e) => { setTienda(Number(e.target.value)); setSel([]); }}>{tiendas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></Campo>
        <Campo label="Trabajos sin facturar desde" id="fd"><input id="fd" type="date" value={desde} onChange={(e) => setDesde(e.target.value || hoyISO())} /></Campo>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
        {!trabajos ? <Cargando error={error} /> : trabajos.length === 0 ? <small style={{ color: "var(--gris)" }}>No hay trabajos sin facturar en esas fechas.</small> : trabajos.map((t) => (
          <label key={t.id} className="a-check" style={{ border: "1px solid var(--linea)", borderRadius: 8, padding: "0 10px" }}>
            <input type="checkbox" checked={sel.includes(t.id)} onChange={() => marcar(t)} />
            <span style={{ flex: 1 }}>{t.descripcion || SERVICIOS[t.tipo_servicio]} <small style={{ color: "var(--gris)" }}>· {fechaCorta(t.fecha)} · {t.usuario_nombre}{t.descuento_cent ? ` · dto. ${eur2(t.descuento_cent)}` : ""}</small></span>
            <strong>{eur2(t.importe_cent)}</strong>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lineas.map((l, i) => (
          <div key={i} className="a-fila" style={{ flexWrap: "nowrap" }}>
            <input aria-label="Concepto" placeholder="Concepto (producto, bono…)" value={l.descripcion} onChange={(e) => setLineas(lineas.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))} />
            <input aria-label="Cantidad" inputMode="numeric" value={l.cantidad} onChange={(e) => setLineas(lineas.map((x, j) => j === i ? { ...x, cantidad: e.target.value } : x))} style={{ width: 64 }} />
            <input aria-label="Precio con IVA" placeholder="€" inputMode="decimal" value={l.precio} onChange={(e) => setLineas(lineas.map((x, j) => j === i ? { ...x, precio: e.target.value } : x))} style={{ width: 96 }} />
            <button className="a-btn a-btn-sm" aria-label="Quitar línea" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button className="a-btn a-btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setLineas([...lineas, { descripcion: "", precio: "", cantidad: "1" }])}>Añadir línea libre</button>
      </div>
      <Campo label="Forma de pago" id="fp"><select id="fp" value={pago} onChange={(e) => setPago(e.target.value)}><option value="">La del trabajo</option>{Object.entries(PAGOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
      <details open={tipo === "F1"}>
        <summary>Datos del cliente {tipo === "F2" ? "(opcional en ticket)" : ""}</summary>
        <div style={{ marginTop: 12 }}><CamposDestinatario d={dest} setD={setDest} completa={tipo === "F1"} /></div>
      </details>
    </Modal>
  );
}

function Rectificar({ f, onCerrar, onHecho }: { f: Factura; onCerrar: () => void; onHecho: () => void }) {
  const aviso = useAviso();
  const [motivo, setMotivo] = useState("");
  const [total, setTotal] = useState(true);
  const [importe, setImporte] = useState("");
  const [tipo, setTipo] = useState(f.tipo === "F2" ? "R5" : "R4");
  const [dest, setDest] = useState<Dest>({ ...DEST0, ...(f.destinatario as any) });
  const [enviando, setEnviando] = useState(false);
  const iva = f.desglose[0]?.iva_x100 ?? 2100;

  async function hacer() {
    setEnviando(true);
    try {
      const r = await api<Factura>(`/facturas/${f.id}/rectificar`, { method: "POST", json: {
        motivo, tipo, total,
        lineas: total ? [] : [{ descripcion: motivo, precio_cent: aCent(importe), iva_x100: iva }],
        destinatario: f.tipo === "F1" ? limpiarDest(dest) : null,
      } });
      aviso(`Rectificativa ${r.num_serie} emitida`);
      abrirArchivo(`/facturas/${r.id}/pdf`).catch(() => {});
      onHecho();
    } catch (e: any) { aviso(e.message, true); } finally { setEnviando(false); }
  }

  return (
    <Modal titulo={`Rectificar ${f.num_serie}`} onCerrar={onCerrar} pie={<>
      <button className="a-btn" onClick={onCerrar}>Cancelar</button>
      <button className="a-btn a-btn-p" disabled={enviando || motivo.trim().length < 3 || (!total && !aCent(importe))} onClick={hacer}>{enviando ? "Emitiendo…" : "Emitir rectificativa"}</button>
    </>}>
      <p style={{ margin: 0, color: "var(--gris)" }}>La factura original no se toca: se emite otra que la corrige. Total original {eur2(f.total_cent)}.</p>
      <Campo label="Motivo" id="rm"><input id="rm" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Devolución, precio equivocado…" /></Campo>
      <div className="a-seg" role="group" aria-label="Alcance">
        <button aria-pressed={total} onClick={() => setTotal(true)}>Devolver todo ({eur2(-f.total_cent)})</button>
        <button aria-pressed={!total} onClick={() => setTotal(false)}>Ajustar un importe</button>
      </div>
      {!total && <Campo label="Diferencia con IVA (€)" id="ri" nota="En negativo si se devuelve dinero; en positivo si se cobró de menos"><input id="ri" inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="-20" /></Campo>}
      {f.tipo === "F1" && (
        <>
          <Campo label="Causa" id="rt"><select id="rt" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="R4">R4 · Otras causas (devolución, error de importe…)</option>
            <option value="R1">R1 · Error fundado en derecho / art. 80 Uno, Dos y Seis LIVA</option>
            <option value="R2">R2 · Concurso de acreedores (art. 80.Tres)</option>
            <option value="R3">R3 · Crédito incobrable (art. 80.Cuatro)</option>
          </select></Campo>
          <details><summary>Datos del cliente</summary><div style={{ marginTop: 12 }}><CamposDestinatario d={dest} setD={setDest} completa /></div></details>
        </>
      )}
    </Modal>
  );
}

function Anular({ f, onCerrar, onHecho }: { f: Factura; onCerrar: () => void; onHecho: () => void }) {
  const aviso = useAviso();
  const [motivo, setMotivo] = useState("");
  return (
    <Modal titulo={`Anular ${f.num_serie}`} onCerrar={onCerrar} pie={<>
      <button className="a-btn" onClick={onCerrar}>Cancelar</button>
      <button className="a-btn a-btn-p" disabled={motivo.trim().length < 3} onClick={async () => {
        try { await api(`/facturas/${f.id}/anular`, { method: "POST", json: { motivo } }); aviso("Factura anulada"); onHecho(); }
        catch (e: any) { aviso(e.message, true); }
      }}>Anular factura</button>
    </>}>
      <p style={{ margin: 0 }}>Solo para facturas que <strong>no debieron emitirse</strong> (duplicada, estudio equivocado…). Si hubo venta y hay que devolver dinero o cambiar el importe, usa <strong>Rectificar</strong>.</p>
      <p style={{ margin: 0, color: "var(--gris)" }}>El número no se reutiliza. Los trabajos vuelven a quedar pendientes de facturar.</p>
      <Campo label="Motivo" id="am"><input id="am" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
    </Modal>
  );
}

// ------------------------------------------------------------------ descuentos
type Descuento = { id: number; nombre: string; tipo: string; valor: number; solo_gestion: boolean; activo: boolean; desde: string | null; hasta: string | null };

function Descuentos() {
  const aviso = useAviso();
  const { datos, error, recargar } = useDatos(() => api<Descuento[]>("/descuentos", { query: { todos: true } }), []);
  const [edit, setEdit] = useState<Partial<Descuento> | null>(null);
  const [valor, setValor] = useState("");

  async function guardar() {
    const d = edit!;
    const v = d.tipo === "porcentaje" ? parseInt(valor) : aCent(valor);
    try {
      await api(d.id ? `/descuentos/${d.id}` : "/descuentos", { method: d.id ? "PUT" : "POST", json: {
        nombre: d.nombre, tipo: d.tipo, valor: v, solo_gestion: !!d.solo_gestion, activo: d.activo !== false, desde: d.desde || null, hasta: d.hasta || null,
      } });
      aviso("Descuento guardado"); setEdit(null); recargar();
    } catch (e: any) { aviso(e.message, true); }
  }
  const abrir = (d: Partial<Descuento>) => { setEdit(d); setValor(d.valor ? (d.tipo === "porcentaje" ? String(d.valor) : String(d.valor / 100).replace(".", ",")) : ""); };

  return (
    <>
      <div className="a-fila" style={{ justifyContent: "space-between" }}>
        <p style={{ margin: 0, color: "var(--gris)" }}>Descuentos que el equipo puede elegir al registrar un trabajo. También se puede poner uno a mano con su motivo.</p>
        <button className="a-btn a-btn-p" onClick={() => abrir({ tipo: "porcentaje", activo: true })}>Nuevo descuento</button>
      </div>
      {!datos ? <Cargando error={error} /> : datos.length === 0 ? <div className="a-vacio">Aún no hay descuentos predefinidos.</div> : (
        <div className="a-tabla"><table>
          <thead><tr><th>Nombre</th><th className="a-num">Valor</th><th>Quién puede aplicarlo</th><th>Vigencia</th><th>Estado</th><th /></tr></thead>
          <tbody>{datos.map((d) => (
            <tr key={d.id}>
              <td><strong>{d.nombre}</strong></td>
              <td className="a-num">{d.tipo === "porcentaje" ? `${d.valor} %` : eur2(d.valor)}</td>
              <td>{d.solo_gestion ? "Recepción y administración" : "Todo el equipo"}</td>
              <td>{d.desde || d.hasta ? `${d.desde ? fechaCorta(d.desde) : "…"} – ${d.hasta ? fechaCorta(d.hasta) : "…"}` : "Siempre"}</td>
              <td><span className="a-chip">{d.activo ? "Activo" : "Inactivo"}</span></td>
              <td className="a-num"><button className="a-btn a-btn-sm" onClick={() => abrir(d)}>Editar</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {edit && (
        <Modal titulo={edit.id ? "Editar descuento" : "Nuevo descuento"} onCerrar={() => setEdit(null)} pie={<>
          <button className="a-btn" onClick={() => setEdit(null)}>Cancelar</button>
          <button className="a-btn a-btn-p" disabled={!edit.nombre || !valor} onClick={guardar}>Guardar</button>
        </>}>
          <div className="a-form">
            <Campo label="Nombre" id="dn" ancho><input id="dn" value={edit.nombre ?? ""} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} placeholder="Amigos, 2ª sesión, Black Friday…" /></Campo>
            <Campo label="Tipo" id="dt"><select id="dt" value={edit.tipo} onChange={(e) => setEdit({ ...edit, tipo: e.target.value })}><option value="porcentaje">Porcentaje</option><option value="importe">Importe fijo (€)</option></select></Campo>
            <Campo label={edit.tipo === "porcentaje" ? "Porcentaje" : "Importe (€)"} id="dv"><input id="dv" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
            <Campo label="Desde (opcional)" id="dde"><input id="dde" type="date" value={edit.desde ?? ""} onChange={(e) => setEdit({ ...edit, desde: e.target.value })} /></Campo>
            <Campo label="Hasta (opcional)" id="dha"><input id="dha" type="date" value={edit.hasta ?? ""} onChange={(e) => setEdit({ ...edit, hasta: e.target.value })} /></Campo>
            <label className="a-check a-ancho"><input type="checkbox" checked={!!edit.solo_gestion} onChange={(e) => setEdit({ ...edit, solo_gestion: e.target.checked })} />Solo recepción y administración pueden aplicarlo</label>
            <label className="a-check a-ancho"><input type="checkbox" checked={edit.activo !== false} onChange={(e) => setEdit({ ...edit, activo: e.target.checked })} />Activo</label>
          </div>
        </Modal>
      )}
    </>
  );
}

// ------------------------------------------------------------------ IVA
function trimestre(n: number, anio: number) {
  const m = (n - 1) * 3 + 1;
  const fin = new Date(anio, m + 2, 0).getDate();
  return { desde: `${anio}-${String(m).padStart(2, "0")}-01`, hasta: `${anio}-${String(m + 2).padStart(2, "0")}-${fin}` };
}

function Iva() {
  const { tiendas } = useAuth();
  const anio = new Date().getFullYear();
  const tActual = Math.floor(new Date().getMonth() / 3) + 1;
  const [per, setPer] = useState(trimestre(tActual, anio));
  const [tienda, setTienda] = useState("");
  const { datos: r, error } = useDatos(() => api("/facturacion/iva", { query: { ...per, tienda_id: tienda } }), [per.desde, per.hasta, tienda]);

  return (
    <>
      <div className="a-fila">
        <div className="a-seg" role="group" aria-label="Trimestre">
          {[1, 2, 3, 4].map((n) => { const t = trimestre(n, anio); return <button key={n} aria-pressed={per.desde === t.desde && per.hasta === t.hasta} onClick={() => setPer(t)}>{n}T {anio}</button>; })}
        </div>
        <input type="date" aria-label="Desde" value={per.desde} onChange={(e) => setPer({ ...per, desde: e.target.value })} style={{ width: 160 }} />
        <input type="date" aria-label="Hasta" value={per.hasta} onChange={(e) => setPer({ ...per, hasta: e.target.value })} style={{ width: 160 }} />
        <select aria-label="Estudio" value={tienda} onChange={(e) => setTienda(e.target.value)} style={{ width: 200 }}>
          <option value="">Todos los estudios</option>{tiendas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <button className="a-btn" style={{ marginLeft: "auto" }} onClick={() => abrirArchivo("/facturacion/libro.csv", `libro_facturas_${per.desde}_${per.hasta}.csv`, { ...per, tienda_id: tienda })}>Libro de facturas (Excel)</button>
      </div>
      {!r ? <Cargando error={error} /> : (
        <>
          <div className="a-grid">
            <div className="a-kpi"><span>Base imponible</span><strong>{eur2(r.base_cent)}</strong></div>
            <div className="a-kpi"><span>IVA repercutido</span><strong>{eur2(r.cuota_cent)}</strong></div>
            <div className="a-kpi"><span>Total facturado</span><strong>{eur2(r.total_cent)}</strong></div>
            <div className="a-kpi"><span>Facturas</span><strong>{r.facturas}</strong></div>
          </div>
          {r.sin_factura.trabajos > 0 && (
            <div className="a-tarjeta" style={{ borderColor: "#E9B949", background: "#FFF8E6" }}>
              <strong>{r.sin_factura.trabajos} trabajos cobrados sin ticket ni factura ({eur2(r.sin_factura.total_cent)})</strong>
              <small>Toda venta necesita su factura o ticket. Emítelos desde «Facturas → Nueva factura» para que entren en el libro y en el IVA.</small>
            </div>
          )}
          <div className="a-tabla"><table>
            <thead><tr><th>Tipo de IVA</th><th className="a-num">Base imponible</th><th className="a-num">Cuota</th></tr></thead>
            <tbody>
              {r.desglose.length === 0 ? <tr><td colSpan={3} style={{ color: "var(--gris)" }}>Sin facturas en el periodo.</td></tr> : r.desglose.map((g: any) => (
                <tr key={g.iva_x100}><td>{pctIva(g.iva_x100)}</td><td className="a-num">{eur2(g.base_cent)}</td><td className="a-num">{eur2(g.cuota_cent)}</td></tr>
              ))}
            </tbody>
          </table></div>
          <p style={{ margin: 0, color: "var(--gris)", fontSize: 13 }}>Resumen orientativo del IVA devengado (casillas de IVA repercutido del modelo 303). La declaración la revisa y presenta la asesoría; el IVA soportado de compras no está en esta app.</p>
        </>
      )}
    </>
  );
}
