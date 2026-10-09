import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ESTADOS_ENVIO, fechaHora, SERVICIOS } from "../lib/format";
import { useAuth } from "./auth";
import { Campo, Cargando, useAviso, useDatos } from "./ui";

/** Edita la configuración fiscal (se guarda entera con PUT /facturacion/config). */
function useConfig() {
  const aviso = useAviso();
  const { datos, error, recargar } = useDatos(() => api("/facturacion/config"), []);
  const [c, setC] = useState<any>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (datos) setC(structuredClone(datos)); }, [datos]);
  const set = (ruta: string[], v: any) => setC((prev: any) => {
    const copia = structuredClone(prev);
    let o = copia;
    ruta.slice(0, -1).forEach((k) => (o = o[k] ??= {}));
    o[ruta[ruta.length - 1]] = v;
    return copia;
  });
  async function guardar(claves: string[]) {
    setGuardando(true);
    try {
      await api("/facturacion/config", { method: "PUT", json: Object.fromEntries(claves.map((k) => [k, c[k]])) });
      aviso("Configuración guardada"); recargar();
    } catch (e: any) { aviso(e.message, true); } finally { setGuardando(false); }
  }
  return { c, set, guardar, guardando, error };
}

export function DatosFiscales() {
  const { tiendas } = useAuth();
  const { c, set, guardar, guardando, error } = useConfig();
  if (!c) return <Cargando error={error} />;
  const em = c.emisor;
  const bloqueado = c.bloqueado?.emisor_nif;
  const txt = (ruta: string[], label: string, id: string, extra: any = {}) => (
    <Campo label={label} id={id} nota={extra.nota} ancho={extra.ancho}>
      <input id={id} value={ruta.reduce((o, k) => o?.[k], c) ?? ""} disabled={extra.disabled} onChange={(e) => set(ruta, e.target.value)} />
    </Campo>
  );
  return (
    <>
      <section className="a-tarjeta">
        <h2>Datos del emisor</h2>
        <p style={{ margin: 0, color: "var(--gris)" }}>Aparecen en todas las facturas. Pídeselos a la asesoría del estudio: titular (autónomo o sociedad), NIF y domicilio fiscal.</p>
        <div className="a-form">
          {txt(["emisor", "razon_social"], "Razón social o nombre del titular", "er", { ancho: true })}
          {txt(["emisor", "nif"], "NIF", "en", { disabled: bloqueado, nota: bloqueado ? "Ya hay facturas con este NIF: no se puede cambiar" : undefined })}
          {txt(["emisor", "domicilio"], "Domicilio fiscal", "ed", { ancho: true })}
          {txt(["emisor", "codigo_postal"], "Código postal", "ecp")}
          {txt(["emisor", "localidad"], "Localidad", "el")}
          {txt(["emisor", "provincia"], "Provincia", "epr")}
        </div>
        <button className="a-btn a-btn-p" style={{ alignSelf: "flex-start" }} disabled={guardando} onClick={() => guardar(["emisor"])}>Guardar datos del emisor</button>
      </section>

      <section className="a-tarjeta">
        <h2>IVA y precios</h2>
        <div className="a-form">
          {Object.entries(SERVICIOS).map(([k, v]) => (
            <Campo key={k} label={`IVA de ${v.toLowerCase()} (%)`} id={`iva-${k}`}>
              <select id={`iva-${k}`} value={c.iva[k] ?? 2100} onChange={(e) => set(["iva", k], Number(e.target.value))}>
                {[2100, 1000, 400, 0].map((x) => <option key={x} value={x}>{x / 100} %</option>)}
              </select>
            </Campo>
          ))}
          <label className="a-check a-ancho"><input type="checkbox" checked={c.precios_con_iva} onChange={(e) => set(["precios_con_iva"], e.target.checked)} />Los precios que se cobran ya llevan el IVA incluido</label>
          <Campo label="La comisión del profesional se calcula sobre" id="cs" ancho nota="Con «base», el profesional cobra su % sobre el precio sin IVA y el estudio se queda el resto (incluido el IVA que tiene que ingresar).">
            <select id="cs" value={c.comision_sobre} onChange={(e) => set(["comision_sobre"], e.target.value)}>
              <option value="total">El total cobrado (IVA incluido)</option>
              <option value="base">La base sin IVA</option>
            </select>
          </Campo>
          <Campo label="Límite del ticket (€, IVA incl.)" id="ls" nota="Por encima, factura completa con datos del cliente">
            <input id="ls" inputMode="numeric" value={c.limite_simplificada_cent / 100} onChange={(e) => set(["limite_simplificada_cent"], Math.round(Number(e.target.value.replace(",", ".")) * 100) || 0)} />
          </Campo>
          <Campo label="Descuento máximo sin autorización (%)" id="dm" nota="Lo que puede poner a mano un profesional">
            <input id="dm" inputMode="numeric" value={c.descuento_max_pct} onChange={(e) => set(["descuento_max_pct"], Number(e.target.value) || 0)} />
          </Campo>
        </div>
        <button className="a-btn a-btn-p" style={{ alignSelf: "flex-start" }} disabled={guardando} onClick={() => guardar(["iva", "precios_con_iva", "comision_sobre", "limite_simplificada_cent", "descuento_max_pct"])}>Guardar IVA y precios</button>
      </section>

      <section className="a-tarjeta">
        <h2>Series de numeración</h2>
        <p style={{ margin: 0, color: "var(--gris)" }}>Número = tipo + estudio + año + correlativo. Ejemplo: <strong>{c.series.F2}{c.prefijo_tienda[String(tiendas[0]?.id)] || (tiendas[0]?.slug ?? "X")[0].toUpperCase()}{String(new Date().getFullYear()).slice(2)}-00001</strong>. Cambia solo antes de empezar a facturar.</p>
        <div className="a-form">
          {txt(["series", "F2"], "Prefijo de tickets", "s2")}
          {txt(["series", "F1"], "Prefijo de facturas", "s1")}
          {txt(["series", "R"], "Prefijo de rectificativas", "sr")}
          {tiendas.map((t) => (
            <Campo key={t.id} label={`Letra de ${t.nombre}`} id={`pt-${t.id}`}>
              <input id={`pt-${t.id}`} maxLength={3} value={c.prefijo_tienda[String(t.id)] ?? ""} placeholder={(t.slug ?? t.nombre)[0].toUpperCase()} onChange={(e) => set(["prefijo_tienda", String(t.id)], e.target.value.toUpperCase())} />
            </Campo>
          ))}
          <Campo label="Texto al pie de la factura" id="tp" ancho nota="Opcional: registro mercantil, condiciones…"><input id="tp" value={c.texto_pie} onChange={(e) => set(["texto_pie"], e.target.value)} /></Campo>
        </div>
        <button className="a-btn a-btn-p" style={{ alignSelf: "flex-start" }} disabled={guardando} onClick={() => guardar(["series", "prefijo_tienda", "texto_pie"])}>Guardar series</button>
      </section>
    </>
  );
}

const MODOS: Record<string, string> = {
  desactivado: "Desactivado: no se generan registros",
  preparado: "Preparado: genera y encadena los registros, sin enviarlos (recomendado hasta la fecha obligatoria)",
  pruebas: "Pruebas: envía al entorno de pruebas de la AEAT",
  produccion: "Producción: envía a la AEAT (definitivo)",
};

export function Verifactu() {
  const aviso = useAviso();
  const { c, set, guardar, guardando, error } = useConfig();
  const { datos: est, recargar } = useDatos(() => api("/verifactu/estado"), []);
  const { datos: regs, recargar: recargarRegs } = useDatos(() => api<any[]>("/verifactu/registros", { query: { limit: 30 } }), []);
  const [enviando, setEnviando] = useState(false);
  if (!c) return <Cargando error={error} />;
  const vf = c.verifactu;

  async function enviar() {
    setEnviando(true);
    try {
      const r = await api("/verifactu/enviar", { method: "POST" });
      aviso(r.enviados ? `Enviados ${r.enviados} registros (${r.estado ?? r.http})` : r.motivo, !r.enviados);
      recargar(); recargarRegs();
    } catch (e: any) { aviso(e.message, true); } finally { setEnviando(false); }
  }

  return (
    <>
      {est && (
        <div className="a-grid">
          <div className="a-kpi"><span>Modo</span><strong style={{ fontSize: 20 }}>{est.modo}</strong></div>
          <div className="a-kpi"><span>Cadena de huellas</span><strong style={{ fontSize: 20, color: est.cadena?.ok === false ? "#A1271D" : undefined }}>{est.cadena ? (est.cadena.ok ? `Íntegra · ${est.cadena.registros} registros` : `Rota en ${est.cadena.num_serie}`) : "—"}</strong></div>
          <div className="a-kpi"><span>Estado de envío</span><strong style={{ fontSize: 16, fontFamily: "inherit" }}>{Object.entries(est.registros).map(([k, v]) => `${ESTADOS_ENVIO[k] ?? k}: ${v}`).join(" · ") || "Sin registros"}</strong></div>
        </div>
      )}
      <section className="a-tarjeta">
        <h2>Modo de funcionamiento</h2>
        <p style={{ margin: 0, color: "var(--gris)" }}>VERI*FACTU será obligatorio el 1 de enero de 2027 para sociedades y el 1 de julio de 2027 para autónomos. Hasta entonces deja «Preparado». Antes de pasar a «Producción», prueba en «Pruebas» con el certificado del estudio. Una vez enviando, no se puede volver atrás.</p>
        <Campo label="Modo" id="vm"><select id="vm" value={vf.modo} onChange={(e) => set(["verifactu", "modo"], e.target.value)}>{Object.entries(MODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
        <label className="a-check"><input type="checkbox" checked={!!vf.envio_automatico} onChange={(e) => set(["verifactu", "envio_automatico"], e.target.checked)} />Enviar automáticamente al emitir (en pruebas o producción)</label>
        <div className="a-form">
          <Campo label="Ruta del certificado (.pfx) en el servidor" id="vc" ancho nota="Se sube al volumen del servidor, nunca al repositorio. La contraseña va en la variable de entorno indicada abajo.">
            <input id="vc" value={vf.certificado_pfx} onChange={(e) => set(["verifactu", "certificado_pfx"], e.target.value)} placeholder="/data/certs/estudio.pfx" />
          </Campo>
          <Campo label="Variable con la contraseña" id="vp"><input id="vp" value={vf.certificado_password_env} onChange={(e) => set(["verifactu", "certificado_password_env"], e.target.value)} /></Campo>
        </div>
        <h3 style={{ fontSize: 16 }}>Sistema informático (productor del software)</h3>
        <div className="a-form">
          <Campo label="Nombre o razón social del productor" id="sn" ancho><input id="sn" value={vf.sistema.nombre_razon} onChange={(e) => set(["verifactu", "sistema", "nombre_razon"], e.target.value)} /></Campo>
          <Campo label="NIF del productor" id="snif"><input id="snif" value={vf.sistema.nif} onChange={(e) => set(["verifactu", "sistema", "nif"], e.target.value.toUpperCase())} /></Campo>
          <Campo label="Nombre del sistema" id="sns"><input id="sns" value={vf.sistema.nombre_sistema} onChange={(e) => set(["verifactu", "sistema", "nombre_sistema"], e.target.value)} /></Campo>
          <Campo label="Versión" id="sv"><input id="sv" value={vf.sistema.version} onChange={(e) => set(["verifactu", "sistema", "version"], e.target.value)} /></Campo>
          <Campo label="Nº de instalación" id="si"><input id="si" value={vf.sistema.numero_instalacion} onChange={(e) => set(["verifactu", "sistema", "numero_instalacion"], e.target.value)} /></Campo>
        </div>
        <div className="a-fila">
          <button className="a-btn a-btn-p" disabled={guardando} onClick={() => guardar(["verifactu"]).then(() => recargar())}>Guardar</button>
          <button className="a-btn" disabled={enviando || !["pruebas", "produccion"].includes(est?.modo)} onClick={enviar}>{enviando ? "Enviando…" : "Enviar pendientes ahora"}</button>
        </div>
      </section>
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2>Últimos registros</h2>
        {!regs ? <Cargando /> : regs.length === 0 ? <div className="a-vacio">Aún no hay registros de facturación.</div> : (
          <div className="a-tabla"><table>
            <thead><tr><th>Factura</th><th>Tipo</th><th>Generado</th><th>Huella</th><th>Envío</th></tr></thead>
            <tbody>{regs.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.num_serie}</strong></td><td>{r.tipo === "alta" ? "Alta" : "Anulación"}</td>
                <td>{fechaHora(r.fecha_hora_gen)}</td>
                <td><code style={{ fontSize: 12 }} title={r.huella}>{r.huella.slice(0, 16)}…</code></td>
                <td><small>{ESTADOS_ENVIO[r.estado_envio] ?? r.estado_envio}{r.csv_aeat ? ` · CSV ${r.csv_aeat}` : ""}</small></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      <p style={{ margin: 0, color: "var(--gris)", fontSize: 13 }}>Las facturas emitidas no se pueden editar ni borrar; cada alta o anulación queda encadenada con la anterior.</p>
    </>
  );
}
