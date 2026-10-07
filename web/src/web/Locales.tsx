import { Link } from "react-router-dom";
import { track } from "../lib/consent";
import { useConsent, abrirPreferencias } from "./Cookies";
import { useLang } from "./i18n";
import { isMovil, telHref, type Ubicacion } from "./useWeb";

export function TarjetaLocal({ u, h = 3 }: { u: Ubicacion; h?: 2 | 3 }) {
  const { t, ruta, lang } = useLang();
  const c = useConsent();
  const H = (h === 2 ? "h2" : "h3") as any;
  const destino = encodeURIComponent(`${u.direccion}, ${u.codigo_postal} ${u.localidad}`);
  const horario = u.horario.map((x) => `${x.dias === "Mo-Su" ? t.todosLosDias : x.dias} · ${x.abre}–${x.cierra}`).join(" / ");
  return (
    <article className="w-local">
      {c?.marketing ? (
        <iframe title={`Mapa ${u.nombre}`} loading="lazy" src={`https://www.google.com/maps?q=${destino}&output=embed&hl=${lang}`} />
      ) : (
        <div className="w-mapa-off">
          <button className="w-cookies-link" onClick={abrirPreferencias}>
            {lang === "es" ? "Activa las cookies de marketing para ver el mapa" : "Enable marketing cookies to see the map"}
          </button>
        </div>
      )}
      <div className="w-local-body">
        <span className="w-local-tag">{t.tagLocal[u.slug] ?? ""}</span>
        <H>{u.nombre}</H>
        <p>{u.direccion}, {u.codigo_postal} {u.localidad}</p>
        <p>{horario}</p>
        <div className="w-local-acc">
          <a className="w-btn w-btn-sutil w-btn-sm" href={telHref(u.telefono)} onClick={() => track("clic_telefono", { tienda: u.slug })}>{t.llamar}</a>
          <a className="w-btn w-btn-sutil w-btn-sm" href={isMovil() ? u.apple_maps : u.google_maps} target="_blank" rel="noopener" onClick={() => track("clic_como_llegar", { tienda: u.slug })}>{t.comoLlegar}</a>
          <Link className="w-btn w-btn-claro w-btn-sm" to={ruta("/reservar") + "?local=" + u.slug} onClick={() => track("seleccion_ubicacion", { tienda: u.slug })}>{t.reservarAqui}</Link>
        </div>
      </div>
    </article>
  );
}
