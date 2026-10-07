import { Link, useParams } from "react-router-dom";
import { useLang } from "./i18n";
import { TarjetaLocal } from "./Locales";
import { useWeb } from "./useWeb";
import { useSeo } from "./WebLayout";

export default function Local() {
  const { slug } = useParams();
  const { t, ruta, lang } = useLang();
  const { ubis } = useWeb();
  const u = ubis.find((x) => x.slug === slug);
  useSeo(u?.nombre, u ? `${u.nombre}: ${lang === "es" ? "tatuajes y piercing en" : "tattoo and piercing in"} ${u.direccion}, Eivissa.` : undefined);
  if (!ubis.length) return <div className="w-legal" />;
  if (!u) return <div className="w-legal"><p>{t.noEncontrado}</p><Link to={ruta("/")}>{t.volverInicio}</Link></div>;
  return (
    <div className="w-wrap" style={{ maxWidth: 820, paddingTop: 32, paddingBottom: 64 }}>
      <TarjetaLocal u={u} h={2} />
    </div>
  );
}
