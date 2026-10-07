import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { track } from "../lib/consent";
import { useLang } from "./i18n";
import { TarjetaLocal } from "./Locales";
import { useWeb } from "./useWeb";
import { useSeo } from "./WebLayout";

type Foto = { id: number; foto_url: string; descripcion: string | null; tipo: string; tienda_id: number; usuario_id: number };

export default function Home() {
  const { t, ruta, lang } = useLang();
  const { cfg, ubis } = useWeb();
  useSeo();
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [filtro, setFiltro] = useState("todo");
  const [abierta, setAbierta] = useState<Foto | null>(null);

  useEffect(() => {
    api<{ trabajos: Foto[] }>("/publico/portfolio", { query: { limit: 24 } }).then((r) => setFotos(r.trabajos)).catch(() => setFotos([]));
  }, []);
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [fotos]);

  const web = cfg?.web ?? {};
  const ig = web.instagram;
  const val = web.valoracion;
  const faq: { p: string; r: string }[] = web.faq?.[lang] ?? [];
  const idTienda = (slug: string) => ubis.find((u) => u.slug === slug)?.id;
  const filtros = [["todo", t.todo], ["tatuaje", t.serv.tattoo[0]], ["piercing", "Piercing"], ...ubis.map((u) => [u.slug, u.slug === "puerto" ? "Puerto" : "Beach"])];
  const visibles = (fotos ?? []).filter((f) =>
    filtro === "todo" ? true : filtro === "tatuaje" || filtro === "piercing" ? f.tipo === filtro : f.tienda_id === idTienda(filtro));

  return (
    <>
      <section className="w-hero">
        <div className="w-wrap">
          <div className="w-hero-txt">
            <span className="w-kicker">{t.heroKicker}</span>
            <h1>{web.titular?.[lang] ?? t.heroTitulo}</h1>
            <p>{web.subtitulo?.[lang] ?? t.heroTexto}</p>
            <div className="w-acciones">
              <Link to={ruta("/reservar")} className="w-btn w-btn-acento">{t.reservar}</Link>
              <a href="#trabajos" className="w-btn w-btn-linea">{t.verTrabajos}</a>
            </div>
            <div className="w-locs">
              {ubis.map((u) => <Link key={u.slug} to={ruta("/local/" + u.slug)}>{u.slug === "puerto" ? "Puerto" : "Beach"}</Link>)}
            </div>
          </div>
          {(web.hero_video || web.hero_imagen) && (
            <div className="w-hero-media">
              {web.hero_video ? (
                <video src={web.hero_video} poster={web.hero_imagen} autoPlay muted loop playsInline preload="metadata" />
              ) : (
                <img src={web.hero_imagen} alt={cfg?.nombre} {...({ fetchpriority: "high" } as any)} />
              )}
            </div>
          )}
        </div>
      </section>

      <section className="w-confianza" aria-label="Por qué nosotros">
        <div className="w-wrap">
          {val?.media && (
            <div className="w-nota">
              <strong>{String(val.media).replace(".", lang === "es" ? "," : ".")}</strong>
              <span>{val.total} {t.resenas} · {val.fuente}</span>
            </div>
          )}
          {t.confianza.map((c) => <span key={c}>{c}</span>)}
        </div>
      </section>

      <section className="w-sec" id="servicios">
        <div className="w-wrap">
          <h2>{t.servicios}</h2>
          <div className="w-servicios">
            {Object.entries(t.serv).map(([id, [nombre, desc]]) => (
              <Link key={id} className="w-servicio" to={ruta("/reservar") + "?servicio=" + id} onClick={() => track("seleccion_servicio", { servicio: id })}>
                <div><strong>{nombre}</strong><span>{desc}</span></div>
                <span aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="w-sec w-sec-alt" id="trabajos">
        <div className="w-wrap">
          <h2>{t.trabajos}</h2>
          {fotos && fotos.length > 0 && (
            <div className="w-filtros" role="group" aria-label="Filtrar">
              {filtros.map(([id, txt]) => (
                <button key={id} className="w-chip" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{txt}</button>
              ))}
            </div>
          )}
          {fotos && fotos.length === 0 && <p className="w-vacio">{t.sinFotos}</p>}
          <div className="w-galeria">
            {visibles.map((f) => (
              <button key={f.id} className="w-foto" onClick={() => { setAbierta(f); track("clic_portfolio"); }}>
                <img src={f.foto_url} alt={f.descripcion ?? t.trabajos} loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
          {ig && <p><a href={ig} target="_blank" rel="noopener" onClick={() => track("clic_instagram")}>{t.masInstagram}</a></p>}
        </div>
      </section>

      <section className="w-sec" id="estudios">
        <div className="w-wrap">
          <h2>{t.estudios}</h2>
          <div className="w-locales">{ubis.map((u) => <TarjetaLocal key={u.slug} u={u} />)}</div>
        </div>
      </section>

      <section className="w-sec w-sec-alt">
        <div className="w-wrap w-dos">
          <div>
            <h2>{t.comoReservar}</h2>
            <ol className="w-pasos">
              {t.pasos.map(([a, b], i) => (
                <li key={a}><b>{i + 1}</b><div><strong>{a}</strong><span>{b}</span></div></li>
              ))}
            </ol>
            <Link to={ruta("/reservar")} className="w-btn w-btn-acento">{t.pedirPresupuesto}</Link>
          </div>
          {faq.length > 0 && (
            <div className="w-faq" id="faq">
              <h2>{t.preguntas}</h2>
              {faq.map((q) => (
                <details key={q.p}><summary>{q.p}</summary><p>{q.r}</p></details>
              ))}
            </div>
          )}
        </div>
      </section>

      {abierta && (
        <div className="w-modal" role="dialog" aria-label={abierta.descripcion ?? ""} onClick={() => setAbierta(null)}>
          <img src={abierta.foto_url} alt={abierta.descripcion ?? ""} />
          <button className="w-btn w-btn-linea w-btn-sm" onClick={() => setAbierta(null)}>{t.cerrar}</button>
        </div>
      )}
    </>
  );
}
