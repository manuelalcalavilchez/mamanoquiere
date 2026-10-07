import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "./auth";
import { Campo, useAviso } from "./ui";

const MODULOS: Record<string, string> = {
  web_leads: "Solicitudes web", agenda: "Agenda", trabajos: "Trabajos", caja: "Cierre de caja", clientes: "Clientes",
  consentimiento: "Consentimiento digital", mensajes: "Mensajes a clientes", portfolio: "Portfolio público",
  piercing: "Piercing", productos: "Venta de productos", invitados: "Artistas invitados",
};
const ACENTOS = [["#D52B1E", "Rojo intenso"], ["#C2410C", "Naranja coral"], ["#2F5BFF", "Azul eléctrico"], ["#17161A", "Negro"]];
const LEGALES: Record<string, string> = { privacidad: "Política de privacidad", cookies: "Política de cookies", aviso: "Aviso legal" };
type QA = { p: string; r: string };

export default function Ajustes() {
  const { ajustes, refrescar } = useAuth();
  const aviso = useAviso();
  const a = ajustes!;
  const [nombre, setNombre] = useState(a.nombre_estudio);
  const [tema, setTema] = useState<any>(a.tema);
  const [modulos, setModulos] = useState<Record<string, boolean>>(a.modulos);
  const [web, setWeb] = useState<any>(a.web ?? {});
  const [preguntas, setPreguntas] = useState<any[]>(a.preguntas_consentimiento);
  const [textoLegal, setTextoLegal] = useState(a.texto_legal);
  const [lang, setLang] = useState<"es" | "en">("es");
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState("");

  const setW = (ruta: string[], v: any) => {
    const copia = structuredClone(web);
    let o = copia;
    ruta.slice(0, -1).forEach((k) => (o = o[k] ??= {}));
    o[ruta[ruta.length - 1]] = v;
    setWeb(copia);
  };
  const faq: QA[] = web.faq?.[lang] ?? [];
  const setFaq = (lista: QA[]) => setW(["faq", lang], lista);

  async function guardar() {
    setGuardando(true);
    try {
      await api("/ajustes", { method: "PUT", json: { nombre_estudio: nombre, tema, modulos, web, preguntas_consentimiento: preguntas, texto_legal: textoLegal } });
      await refrescar();
      aviso("Cambios guardados");
    } catch (e: any) { aviso(e.message, true); } finally { setGuardando(false); }
  }

  async function subir(campo: string, f?: File) {
    if (!f) return;
    setSubiendo(campo);
    try {
      const fd = new FormData();
      fd.append("archivo", f);
      const r = await api<{ url: string }>("/ajustes/medios", { method: "POST", body: fd });
      setW([campo], r.url);
      aviso("Archivo subido; guarda para publicarlo");
    } catch (e: any) { aviso(e.message, true); } finally { setSubiendo(""); }
  }

  const val = web.valoracion;
  return (
    <>
      <div className="a-cab">
        <div><h1>Personalización</h1><p>Marca, aspecto, módulos y contenido de la web.</p></div>
        <button className="a-btn a-btn-p" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</button>
      </div>

      <section className="a-tarjeta">
        <h2>Marca y aspecto</h2>
        <div className="a-form">
          <Campo label="Nombre del estudio" id="nom"><input id="nom" value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
          <Campo label="Color de acento (web y app)">
            <div className="a-fila">
              {ACENTOS.map(([hex, n]) => (
                <button key={hex} type="button" aria-label={n} aria-pressed={tema.acento === hex} onClick={() => setTema({ ...tema, acento: hex })}
                  style={{ width: 44, height: 44, borderRadius: "50%", background: hex, border: 0, cursor: "pointer", boxShadow: tema.acento === hex ? "0 0 0 3px #fff, 0 0 0 5px #17161A" : "none" }} />
              ))}
              <input type="color" aria-label="Otro color" value={tema.acento} onChange={(e) => setTema({ ...tema, acento: e.target.value })} style={{ width: 52, height: 44 }} />
            </div>
          </Campo>
        </div>
      </section>

      <section className="a-tarjeta">
        <h2>Módulos activos</h2>
        <div className="a-grid" style={{ gap: 4 }}>
          {Object.entries(MODULOS).map(([k, v]) => (
            <label key={k} className="a-check"><input type="checkbox" checked={modulos[k] !== false} onChange={(e) => setModulos({ ...modulos, [k]: e.target.checked })} />{v}</label>
          ))}
        </div>
      </section>

      <section className="a-tarjeta">
        <div className="a-fila" style={{ justifyContent: "space-between" }}>
          <h2>Contenido de la web</h2>
          <div className="a-seg" role="group" aria-label="Idioma">
            <button aria-pressed={lang === "es"} onClick={() => setLang("es")}>Español</button>
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
          </div>
        </div>
        <div className="a-form">
          <Campo label="Titular de portada" id="tit" ancho nota="Vacío = texto por defecto"><input id="tit" value={web.titular?.[lang] ?? ""} onChange={(e) => setW(["titular", lang], e.target.value || undefined)} /></Campo>
          <Campo label="Texto de portada" id="sub" ancho><textarea id="sub" value={web.subtitulo?.[lang] ?? ""} onChange={(e) => setW(["subtitulo", lang], e.target.value || undefined)} /></Campo>
          <Campo label="Título para Google" id="st"><input id="st" value={web.seo?.[lang]?.titulo ?? ""} onChange={(e) => setW(["seo", lang, "titulo"], e.target.value)} /></Campo>
          <Campo label="Descripción para Google" id="sd"><input id="sd" value={web.seo?.[lang]?.descripcion ?? ""} onChange={(e) => setW(["seo", lang, "descripcion"], e.target.value)} /></Campo>
          <Campo label="Imagen de portada" id="hi" nota={web.hero_imagen ? "Subida" : "JPG, WEBP o AVIF, máx. 10 MB"}>
            <input id="hi" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={!!subiendo} onChange={(e) => subir("hero_imagen", e.target.files?.[0])} />
          </Campo>
          <Campo label="Vídeo de portada (opcional)" id="hv" nota={web.hero_video ? "Subido" : "MP4 o WEBM corto, máx. 40 MB"}>
            <input id="hv" type="file" accept="video/mp4,video/webm" disabled={!!subiendo} onChange={(e) => subir("hero_video", e.target.files?.[0])} />
          </Campo>
          <Campo label="Instagram" id="ig"><input id="ig" value={web.instagram ?? ""} onChange={(e) => setW(["instagram"], e.target.value)} /></Campo>
          <Campo label="Valoración verificada" nota="Solo si la puedes comprobar en la fuente">
            <div className="a-fila">
              <input aria-label="Nota media" placeholder="4.9" value={val?.media ?? ""} onChange={(e) => setW(["valoracion"], e.target.value ? { ...val, media: e.target.value } : null)} style={{ width: 80 }} />
              <input aria-label="Número de reseñas" placeholder="246" value={val?.total ?? ""} onChange={(e) => setW(["valoracion"], { ...val, total: e.target.value })} style={{ width: 90 }} disabled={!val} />
              <input aria-label="Fuente" placeholder="Google" value={val?.fuente ?? ""} onChange={(e) => setW(["valoracion"], { ...val, fuente: e.target.value })} style={{ width: 110 }} disabled={!val} />
            </div>
          </Campo>
        </div>

        <h2 style={{ marginTop: 8 }}>Preguntas frecuentes ({lang.toUpperCase()})</h2>
        <small style={{ color: "var(--gris)" }}>La sección solo aparece en la web cuando hay alguna pregunta.</small>
        {faq.map((q, i) => (
          <div key={i} className="a-form" style={{ borderTop: "1px solid var(--suave)", paddingTop: 10 }}>
            <Campo label="Pregunta" id={`fp${i}`}><input id={`fp${i}`} value={q.p} onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, p: e.target.value } : x)))} /></Campo>
            <Campo label="Respuesta" id={`fr${i}`}><textarea id={`fr${i}`} value={q.r} onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, r: e.target.value } : x)))} /></Campo>
            <button className="a-btn a-btn-sm a-btn-peligro" style={{ justifySelf: "start" }} onClick={() => setFaq(faq.filter((_, j) => j !== i))}>Quitar pregunta</button>
          </div>
        ))}
        <button className="a-btn" style={{ alignSelf: "flex-start" }} onClick={() => setFaq([...faq, { p: "", r: "" }])}>Añadir pregunta</button>

        <h2 style={{ marginTop: 8 }}>Textos legales ({lang.toUpperCase()})</h2>
        <small style={{ color: "var(--gris)" }}>Pega aquí los textos revisados por la asesoría. No se traducen automáticamente.</small>
        {Object.entries(LEGALES).map(([k, v]) => (
          <Campo key={k} label={v} id={`lg-${k}`}><textarea id={`lg-${k}`} rows={5} value={web.legal?.[k]?.[lang] ?? ""} onChange={(e) => setW(["legal", k, lang], e.target.value)} /></Campo>
        ))}
      </section>

      <section className="a-tarjeta">
        <h2>Consentimiento informado</h2>
        {preguntas.map((p, i) => (
          <div key={i} className="a-fila" style={{ borderTop: "1px solid var(--suave)", paddingTop: 10 }}>
            <input aria-label={`Pregunta ${i + 1}`} value={p.texto} onChange={(e) => setPreguntas(preguntas.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} style={{ flex: "1 1 260px" }} />
            <label className="a-check"><input type="checkbox" checked={!!p.detalle} onChange={(e) => setPreguntas(preguntas.map((x, j) => (j === i ? { ...x, detalle: e.target.checked } : x)))} />Pide detalle</label>
            <button className="a-btn a-btn-sm a-btn-peligro" onClick={() => setPreguntas(preguntas.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        ))}
        <button className="a-btn" style={{ alignSelf: "flex-start" }} onClick={() => setPreguntas([...preguntas, { id: "p" + Date.now().toString(36), texto: "", tipo: "si_no" }])}>Añadir pregunta</button>
        <Campo label="Texto legal del consentimiento" id="tl" nota="Aparece antes de la firma y en el PDF"><textarea id="tl" rows={6} value={textoLegal} onChange={(e) => setTextoLegal(e.target.value)} /></Campo>
      </section>
      <button className="a-btn a-btn-p" style={{ alignSelf: "flex-start" }} onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</button>
    </>
  );
}
