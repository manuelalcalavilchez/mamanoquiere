import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { ROLES } from "../lib/format";
import { useAuth } from "./auth";
import "./app.css";

const ITEMS: { to: string; txt: string; modulo?: string; rol?: "gestion" | "admin" }[] = [
  { to: "/app/solicitudes", txt: "Solicitudes web", modulo: "web_leads" },
  { to: "/app/agenda", txt: "Agenda", modulo: "agenda" },
  { to: "/app/trabajos", txt: "Trabajos", modulo: "trabajos" },
  { to: "/app/caja", txt: "Caja", modulo: "caja" },
  { to: "/app/facturacion", txt: "Facturación", modulo: "facturacion", rol: "gestion" },
  { to: "/app/clientes", txt: "Clientes", modulo: "clientes" },
  { to: "/app/consentimiento", txt: "Consentimiento", modulo: "consentimiento" },
  { to: "/app/mensajes", txt: "Mensajes", modulo: "mensajes", rol: "gestion" },
  { to: "/app/portfolio", txt: "Portfolio", modulo: "portfolio" },
  { to: "/app/comisiones", txt: "Comisiones", rol: "gestion" },
  { to: "/app/equipo", txt: "Equipo y estudios", rol: "admin" },
  { to: "/app/ajustes", txt: "Personalización", rol: "admin" },
];

export default function Layout() {
  const { yo, ajustes, salir, gestion, admin } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [nuevos, setNuevos] = useState(0);
  const { pathname } = useLocation();
  useEffect(() => setAbierto(false), [pathname]);
  useEffect(() => {
    document.documentElement.lang = "es";
    document.title = `${ajustes?.nombre_estudio ?? "Gestión"} — Gestión`;
    const cargar = () => api<any[]>("/leads", { query: { estado: "nuevo", limit: 100 } }).then((l) => setNuevos(l.length)).catch(() => {});
    cargar();
    const id = setInterval(cargar, 60_000);
    return () => clearInterval(id);
  }, [ajustes]);

  const mods = ajustes?.modulos ?? {};
  const items = ITEMS.filter((i) => (!i.modulo || mods[i.modulo] !== false) && (!i.rol || (i.rol === "admin" ? admin : gestion)));
  return (
    <div className="a" style={ajustes?.tema?.acento ? ({ "--acento": ajustes.tema.acento } as any) : undefined}>
      <div className="a-top">
        <strong>{ajustes?.nombre_estudio ?? "Gestión"}</strong>
        <button aria-label="Abrir menú" aria-expanded={abierto} onClick={() => setAbierto(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </div>
      <nav className={"a-side" + (abierto ? " abierto" : "")} aria-label="Menú principal">
        <div className="a-marca" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{ajustes?.nombre_estudio ?? "Gestión"}</span>
          {abierto && <button className="a-btn a-btn-sm" onClick={() => setAbierto(false)}>Cerrar</button>}
        </div>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to}>
            {i.txt}
            {i.to === "/app/solicitudes" && nuevos > 0 && <span className="a-badge" aria-label={`${nuevos} nuevas`}>{nuevos}</span>}
          </NavLink>
        ))}
        <div className="a-yo">
          <span>{yo?.nombre} · {ROLES[yo?.rol ?? ""]}</span>
          <a href="/" target="_blank" rel="noopener" style={{ padding: 0, minHeight: 32, color: "#D6D3D1" }}>Ver la web</a>
          <button onClick={salir}>Cerrar sesión</button>
        </div>
      </nav>
      <main className="a-main">
        <Outlet />
      </main>
    </div>
  );
}
