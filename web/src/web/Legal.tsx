import { Link, useParams } from "react-router-dom";
import { useLang } from "./i18n";
import { useWeb } from "./useWeb";
import { useSeo } from "./WebLayout";

/** Los textos legales se editan en la app (Ajustes > Web). No se traducen automáticamente. */
export default function Legal() {
  const { doc = "" } = useParams();
  const { t, ruta, lang } = useLang();
  const { cfg } = useWeb();
  const titulos: Record<string, string> = { privacidad: t.legal.privacidad, cookies: t.legal.cookies, aviso: t.legal.aviso };
  useSeo(titulos[doc]);
  const texto: string | undefined = cfg?.web?.legal?.[doc]?.[lang] ?? cfg?.web?.legal?.[doc]?.es;
  if (!titulos[doc]) return <div className="w-legal"><p>{t.noEncontrado}</p></div>;
  return (
    <article className="w-legal">
      <h1>{titulos[doc]}</h1>
      {cfg && !texto && <p>{lang === "es" ? "Texto pendiente de publicar." : "Text not yet published."}</p>}
      {texto?.split(/\n{2,}/).map((p, i) => <p key={i} style={{ whiteSpace: "pre-line" }}>{p}</p>)}
      <p><Link to={ruta("/")}>{t.volverInicio}</Link></p>
    </article>
  );
}
