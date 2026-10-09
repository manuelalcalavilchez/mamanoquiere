import { Navigate, Route, Routes } from "react-router-dom";
import Agenda from "./Agenda";
import Ajustes from "./Ajustes";
import { AuthProvider, Protegido, useAuth } from "./auth";
import Caja from "./Caja";
import { ClienteDetalle, Clientes } from "./Clientes";
import Comisiones from "./Comisiones";
import Consentimiento from "./Consentimiento";
import Equipo from "./Equipo";
import Facturacion from "./Facturacion";
import Layout from "./Layout";
import Login from "./Login";
import Mensajes from "./Mensajes";
import Portfolio from "./Portfolio";
import Solicitudes from "./Solicitudes";
import Trabajos from "./Trabajos";
import { AvisoProvider } from "./ui";

function SoloGestion({ children, admin }: { children: JSX.Element; admin?: boolean }) {
  const a = useAuth();
  return (admin ? a.admin : a.gestion) ? children : <Navigate to="/app/agenda" replace />;
}

export default function AppRoutes() {
  return (
    <AuthProvider>
      <AvisoProvider>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route element={<Protegido><Layout /></Protegido>}>
            <Route index element={<Navigate to="agenda" replace />} />
            <Route path="solicitudes" element={<Solicitudes />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="trabajos" element={<Trabajos />} />
            <Route path="caja" element={<Caja />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="clientes/:id" element={<ClienteDetalle />} />
            <Route path="consentimiento" element={<Consentimiento />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="mensajes" element={<SoloGestion><Mensajes /></SoloGestion>} />
            <Route path="facturacion" element={<SoloGestion><Facturacion /></SoloGestion>} />
            <Route path="comisiones" element={<SoloGestion><Comisiones /></SoloGestion>} />
            <Route path="equipo" element={<SoloGestion admin><Equipo /></SoloGestion>} />
            <Route path="ajustes" element={<SoloGestion admin><Ajustes /></SoloGestion>} />
            <Route path="*" element={<Navigate to="agenda" replace />} />
          </Route>
        </Routes>
      </AvisoProvider>
    </AuthProvider>
  );
}
