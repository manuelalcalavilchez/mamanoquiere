import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { consent } from "../lib/consent";
import { useLang } from "./i18n";

/** Banner de cookies: aceptar y rechazar con el mismo peso (criterio AEPD) y panel de preferencias. */
export function CookieBanner() {
  const { t, ruta } = useLang();
  const [abierto, setAbierto] = useState(!consent.get());
  const [panel, setPanel] = useState(false);
  const [ana, setAna] = useState(false);
  const [mkt, setMkt] = useState(false);

  useEffect(() => {
    const abrir = () => {
      const c = consent.get();
      setAna(!!c?.analitica);
      setMkt(!!c?.marketing);
      setPanel(true);
      setAbierto(true);
    };
    window.addEventListener("mmq-abrir-cookies", abrir);
    return () => window.removeEventListener("mmq-abrir-cookies", abrir);
  }, []);

  if (!abierto) return null;
  const decidir = (analitica: boolean, marketing: boolean) => {
    consent.set({ analitica, marketing });
    setAbierto(false);
    setPanel(false);
  };
  const tipos = t.ckTipos;

  return (
    <section className="w-cookies" role="dialog" aria-label={t.ckTitulo}>
      <div className="w-cookies-in">
        <h2 style={{ fontSize: 24 }}>{panel ? t.preferencias : t.ckTitulo}</h2>
        {!panel ? (
          <>
            <p>
              {t.ckTexto} <Link to={ruta("/legal/cookies")}>{t.legal.cookies}</Link>
            </p>
            <div className="w-cookies-btns">
              <button className="w-btn w-btn-linea" onClick={() => decidir(false, false)}>{t.rechazar}</button>
              <button className="w-btn w-btn-claro" onClick={() => decidir(true, true)}>{t.aceptar}</button>
            </div>
            <button className="w-cookies-link" onClick={() => setPanel(true)}>{t.configurar}</button>
          </>
        ) : (
          <>
            {[
              [tipos[0], true, () => {}, true],
              [tipos[1], ana, () => setAna(!ana), false],
              [tipos[2], mkt, () => setMkt(!mkt), false],
            ].map(([txt, on, fn, fijo]: any) => (
              <div className="w-switch-row" key={txt[0]}>
                <div>
                  <strong>{txt[0]}</strong>
                  <span>{txt[1]}</span>
                </div>
                <button type="button" role="switch" aria-checked={on} aria-label={txt[0]} disabled={fijo} className="w-switch" onClick={fn}>
                  <i />
                </button>
              </div>
            ))}
            <div className="w-cookies-btns">
              <button className="w-btn w-btn-linea" onClick={() => decidir(false, false)}>{t.rechazarTodo}</button>
              <button className="w-btn w-btn-claro" onClick={() => decidir(ana, mkt)}>{t.guardar}</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export const abrirPreferencias = () => window.dispatchEvent(new Event("mmq-abrir-cookies"));

export function useConsent() {
  const [c, setC] = useState(consent.get());
  useEffect(() => {
    const f = () => setC(consent.get());
    window.addEventListener("mmq-consent", f);
    return () => window.removeEventListener("mmq-consent", f);
  }, []);
  return c;
}
