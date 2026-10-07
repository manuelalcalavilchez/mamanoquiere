import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { track } from "../lib/consent";
import { useLang } from "./i18n";
import { useWeb } from "./useWeb";
import { useSeo } from "./WebLayout";

const MAX = 5;
const MB = 8;

export default function Reservar() {
  const { t, ruta, lang } = useLang();
  const { ubis } = useWeb();
  const nav = useNavigate();
  const [params] = useSearchParams();
  useSeo(t.reservar);

  const [paso, setPaso] = useState(1);
  const [servicio, setServicio] = useState(params.get("servicio") ?? "tattoo");
  const [local, setLocal] = useState(params.get("local") ?? "");
  const [f, setF] = useState({ mensaje: "", zona: "", tamano: "", nombre: "", telefono: "", email: "", fecha: "", privacidad: false, comunicaciones: false, website: "" });
  const [archivos, setArchivos] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);
  const empezado = useRef(false);
  const enviado = useRef(false);
  const titulo = useRef<HTMLHeadingElement>(null);

  const previews = useMemo(() => archivos.map((a) => URL.createObjectURL(a)), [archivos]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);
  useEffect(() => { if (!local && ubis.length) setLocal(ubis[0].slug); }, [ubis, local]);
  useEffect(() => { titulo.current?.focus(); window.scrollTo(0, 0); }, [paso, hecho]);
  useEffect(() => () => { if (empezado.current && !enviado.current) track("abandono_formulario"); }, []);

  const empezar = () => {
    if (!empezado.current) { empezado.current = true; track("inicio_formulario"); }
  };
  const set = (k: keyof typeof f) => (e: any) => { empezar(); setError(""); setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }); };
  const servicios = Object.entries(t.serv).filter(([id]) => !local || (ubis.find((u) => u.slug === local)?.servicios ?? [id]).includes(id));

  function añadir(lista: FileList | null) {
    if (!lista) return;
    const nuevos = [...archivos, ...Array.from(lista)];
    if (nuevos.length > MAX || nuevos.some((a) => a.size > MB * 1024 * 1024 || !a.type.startsWith("image/"))) {
      setError(t.errores.archivos);
      return;
    }
    setError("");
    setArchivos(nuevos);
  }

  function validar(): string {
    if (paso === 1 && !servicio) return t.errores.servicio;
    if (paso === 3) {
      if (f.nombre.trim().length < 2) return t.errores.nombre;
      if (f.telefono.replace(/\D/g, "").length < 6) return t.errores.telefono;
      if (!f.privacidad) return t.errores.privacidad;
    }
    return "";
  }

  async function siguiente() {
    const e = validar();
    setError(e);
    if (e) return;
    if (paso < 3) { setPaso(paso + 1); return; }
    setEnviando(true);
    const fd = new FormData();
    Object.entries({
      nombre: f.nombre, telefono: f.telefono, email: f.email, servicio, ubicacion: local, zona_corporal: servicio === "tattoo" ? f.zona : "",
      tamano: servicio === "tattoo" ? f.tamano : "", fecha_preferida: f.fecha, mensaje: f.mensaje, pagina_origen: location.pathname + location.search,
      idioma: lang, acepta_privacidad: "true", acepta_comunicaciones: String(f.comunicaciones), website: f.website,
    }).forEach(([k, v]) => v && fd.append(k, v));
    archivos.forEach((a) => fd.append("adjuntos", a));
    try {
      const res = await fetch("/api/publico/leads", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new ApiError(res.status, typeof d?.detail === "string" ? d.detail : `Error ${res.status}`);
      }
      enviado.current = true;
      track("envio_formulario", { tienda: local, servicio });
      setHecho(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  const ubi = ubis.find((u) => u.slug === local) ?? ubis[0];

  if (hecho)
    return (
      <div className="w-form">
        <h1 ref={titulo} tabIndex={-1}>{t.enviado}</h1>
        <p style={{ color: "var(--texto2)", margin: 0 }}>{t.enviadoTxt}</p>
        {ubi?.whatsapp_url && <a className="w-btn w-btn-linea" href={ubi.whatsapp_url} target="_blank" rel="noopener" onClick={() => track("clic_whatsapp", { tienda: ubi.slug })}>{t.abrirWhatsapp}</a>}
        <Link to={ruta("/")} style={{ textAlign: "center", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.volverInicio}</Link>
      </div>
    );

  return (
    <form className="w-form" onSubmit={(e) => { e.preventDefault(); siguiente(); }} noValidate>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" className="w-btn w-btn-sutil w-btn-sm" onClick={() => (paso > 1 ? setPaso(paso - 1) : nav(-1))}>{t.atras}</button>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 14, color: "var(--texto3)" }}>{t.paso} {paso} {t.de} 3</span>
          <div className="w-progreso"><i style={{ width: `${(paso / 3) * 100}%` }} /></div>
        </div>
      </div>

      {paso === 1 && (
        <>
          <h1 ref={titulo} tabIndex={-1}>{t.queTeHacemos}</h1>
          <div className="w-opciones" role="group" aria-label={t.queTeHacemos}>
            {servicios.map(([id, [n]]) => (
              <button type="button" key={id} className="w-opcion" aria-pressed={servicio === id} onClick={() => { empezar(); setServicio(id); track("seleccion_servicio", { servicio: id }); }}>{n}</button>
            ))}
          </div>
          <h2>{t.enQueEstudio}</h2>
          <div className="w-opciones" role="group" aria-label={t.enQueEstudio}>
            {ubis.map((u) => (
              <button type="button" key={u.slug} className="w-opcion" aria-pressed={local === u.slug} onClick={() => { empezar(); setLocal(u.slug); track("seleccion_ubicacion", { tienda: u.slug }); }}>
                {u.slug === "puerto" ? "Puerto" : "Beach"}<small>{u.direccion}</small>
              </button>
            ))}
          </div>
        </>
      )}

      {paso === 2 && (
        <>
          <h1 ref={titulo} tabIndex={-1}>{t.tuIdea}</h1>
          <div className="w-campo">
            <label htmlFor="msg">{t.descripcion}</label>
            <textarea id="msg" maxLength={3000} placeholder={t.descripcionPh} value={f.mensaje} onChange={set("mensaje")} />
          </div>
          {servicio === "tattoo" && (
            <div className="w-opciones">
              <div className="w-campo">
                <label htmlFor="zona">{t.zona}</label>
                <input id="zona" maxLength={80} placeholder={t.zonaPh} value={f.zona} onChange={set("zona")} />
              </div>
              <div className="w-campo">
                <label htmlFor="tam">{t.tamano}</label>
                <select id="tam" value={f.tamano} onChange={set("tamano")}>
                  <option value="">—</option>
                  {t.tamanos.map((x) => <option key={x}>{x}</option>)}
                </select>
              </div>
            </div>
          )}
          <label className="w-subir">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple onChange={(e) => { añadir(e.target.files); e.target.value = ""; }} />
            <strong>{t.adjuntar}</strong>
            <span style={{ fontSize: 13, color: "var(--texto3)" }}>{t.adjuntarNota}</span>
          </label>
          {archivos.length > 0 && (
            <div className="w-miniaturas">
              {archivos.map((a, i) => (
                <figure key={i}>
                  <img src={previews[i]} alt={a.name} />
                  <button type="button" onClick={() => setArchivos(archivos.filter((_, j) => j !== i))}>{t.quitar}</button>
                </figure>
              ))}
            </div>
          )}
        </>
      )}

      {paso === 3 && (
        <>
          <h1 ref={titulo} tabIndex={-1}>{t.contacto}</h1>
          <div className="w-campo"><label htmlFor="n">{t.nombre}</label><input id="n" autoComplete="name" required value={f.nombre} onChange={set("nombre")} /></div>
          <div className="w-campo"><label htmlFor="tel">{t.telefono}</label><input id="tel" type="tel" autoComplete="tel" required value={f.telefono} onChange={set("telefono")} /></div>
          <div className="w-campo"><label htmlFor="em">{t.email} <span style={{ color: "var(--texto3)", fontWeight: 400 }}>({t.opcional})</span></label><input id="em" type="email" autoComplete="email" value={f.email} onChange={set("email")} /></div>
          <div className="w-campo"><label htmlFor="fe">{t.fecha}</label><input id="fe" type="date" min={new Date().toISOString().slice(0, 10)} value={f.fecha} onChange={set("fecha")} /></div>
          {/* Campo trampa para bots: oculto a personas y lectores de pantalla */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set("website")} style={{ position: "absolute", left: -9999, width: 1, height: 1 }} />
          <label className="w-check"><input type="checkbox" checked={f.privacidad} onChange={set("privacidad")} /><span>{t.aceptoPriv} <Link to={ruta("/legal/privacidad")} target="_blank">{t.legal.privacidad.toLowerCase()}</Link>.</span></label>
          <label className="w-check"><input type="checkbox" checked={f.comunicaciones} onChange={set("comunicaciones")} /><span>{t.aceptoCom}</span></label>
        </>
      )}

      {error && <p className="w-error" role="alert">{error}</p>}
      <div className="w-form-bar">
        <button type="submit" className="w-btn w-btn-acento" disabled={enviando}>{enviando ? t.enviando : paso === 3 ? t.enviar : t.continuar}</button>
      </div>
    </form>
  );
}
