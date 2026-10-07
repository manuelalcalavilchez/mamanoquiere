import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/dm-sans";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./base.css";
import Home from "./web/Home";
import Legal from "./web/Legal";
import Local from "./web/Local";
import Reservar from "./web/Reservar";
import WebLayout from "./web/WebLayout";

// La app de gestión se carga aparte: la web pública no descarga su código
const App = lazy(() => import("./app/AppRoutes"));

function rutasWeb(prefijo: string) {
  return (
    <Route path={prefijo || "/"} element={<WebLayout />}>
      <Route index element={<Home />} />
      <Route path="reservar" element={<Reservar />} />
      <Route path="local/:slug" element={<Local />} />
      <Route path="legal/:doc" element={<Legal />} />
      <Route path="*" element={<Navigate to={prefijo || "/"} replace />} />
    </Route>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/app/*" element={<App />} />
          {rutasWeb("/en")}
          {rutasWeb("")}
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
