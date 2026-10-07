import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { track } from "../lib/consent";
import { abrirPreferencias, CookieBanner } from "./Cookies";
import { otraLengua, useLang } from "./i18n";
import { telHref, useWeb } from "./useWeb";
import "./web.css";

const Icono = {
  tel: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>,
  wa: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.5A8.4 8.4 0 1 1 21 11.5z" /></svg>,
  cal: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
  menu: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
};

/** Título, descripción, idioma y datos estructurados por página. */
export function useSeo(titulo?: string, descripcion?: string) {
  const { lang } = useLang();
  const { cfg, ubis } = useWeb();
  useEffect(() => {
    document.documentElement.lang = lang;
    const seo = cfg?.web?.seo?.[lang];
    document.title = titulo ? `${titulo} | ${cfg?.nombre ?? "Mamanoquiere Tattoo Ibiza"}` : seo?.titulo ?? document.title;
    const d = descripcion ?? seo?.descripcion;
    if (d) document.querySelector('meta[name="description"]')?.setAttribute("content", d);
    let ld = document.getElementById("ld-json");
    if (!ld) {
      ld = document.createElement("script");
      ld.id = "ld-json";
      (ld as HTMLScriptElement).type = "application/ld+json";
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify(ubis.map((u) => u.schema_org));
  }, [lang, titulo, descripcion, cfg, ubis]);
}

export default function WebLayout() {
  const { t, ruta } = useLang();
  const { cfg, ubis } = useWeb();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const principal = ubis[0];
  const ig = cfg?.web?.instagram;
  const enFormulario = pathname.endsWith("/reservar");

  useEffect(() => setMenu(false), [pathname]);
  useEffect(() => {
    if (cfg?.tema?.acento) document.documentElement.style.setProperty("--acento", cfg.tema.acento);
  }, [cfg]);

  const links = (
    <>
      <Link to={ruta("/") + "#servicios"}>{t.nav.tatuajes}</Link>
      <Link to={ruta("/") + "#servicios"}>{t.nav.piercing}</Link>
      <Link to={ruta("/") + "#trabajos"}>{t.nav.portfolio}</Link>
      <Link to={ruta("/") + "#estudios"}>{t.nav.ubicaciones}</Link>
    </>
  );

  return (
    <div className="w" style={cfg?.tema?.acento ? ({ "--acento": cfg.tema.acento } as any) : undefined}>
      <a className="w-skip" href="#contenido">Saltar al contenido</a>
      <header className="w-head">
        <div className="w-wrap">
          <Link to={ruta("/")} className="w-logo">MAMANOQUIERE</Link>
          <nav className="w-nav" aria-label="Principal">{links}</nav>
          <div className="w-headR">
            <Link className="w-lang" to={otraLengua(pathname)} aria-label="Cambiar idioma">{ruta("/") === "/" ? "EN" : "ES"}</Link>
            <Link to={ruta("/reservar")} className="w-btn w-btn-acento w-btn-sm w-cta-head">{t.reservar}</Link>
            <button className="w-burger" aria-label={t.menu} aria-expanded={menu} onClick={() => setMenu(true)}>{Icono.menu}</button>
          </div>
        </div>
      </header>
      {menu && (
        <div className="w-drawer" role="dialog" aria-label={t.menu}>
          <button className="w-btn w-btn-sutil w-btn-sm" style={{ alignSelf: "flex-end" }} onClick={() => setMenu(false)}>{t.cerrar}</button>
          {links}
          <Link to={ruta("/reservar")}>{t.reservar}</Link>
        </div>
      )}
      <main id="contenido">
        <Outlet />
      </main>
      {!enFormulario && (
        <footer className="w-foot">
          <div className="w-wrap">
            <div>
              <strong>{cfg?.nombre ?? "Mamanoquiere Tattoo Ibiza"}</strong>
              {principal && <a href={telHref(principal.telefono)} onClick={() => track("clic_telefono")}>{principal.telefono}</a>}
              {ig && <a href={ig} target="_blank" rel="noopener" onClick={() => track("clic_instagram")}>Instagram</a>}
            </div>
            <div>
              {ubis.map((u) => <Link key={u.slug} to={ruta("/local/" + u.slug)}>{u.nombre}</Link>)}
            </div>
            <div>
              <Link to={ruta("/legal/privacidad")}>{t.legal.privacidad}</Link>
              <Link to={ruta("/legal/cookies")}>{t.legal.cookies}</Link>
              <Link to={ruta("/legal/aviso")}>{t.legal.aviso}</Link>
              <button onClick={abrirPreferencias}>{t.legal.prefs}</button>
            </div>
          </div>
        </footer>
      )}
      {!enFormulario && (
        <nav className="w-bar" aria-label="Acciones rápidas">
          <a href={telHref(principal?.telefono)} onClick={() => track("clic_telefono")}>{Icono.tel}{t.llamar}</a>
          <a href={principal?.whatsapp_url ?? "#"} target="_blank" rel="noopener" onClick={() => track("clic_whatsapp")}>{Icono.wa}{t.whatsapp}</a>
          <Link to={ruta("/reservar")} className="w-bar-acento">{Icono.cal}{t.reservar}</Link>
        </nav>
      )}
      <CookieBanner />
    </div>
  );
}
