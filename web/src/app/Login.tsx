import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth";
import "./app.css";

export default function Login() {
  const { entrar, yo } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as any;
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  if (yo) return <Navigate to={loc.state?.desde ?? "/app/agenda"} replace />;
  return (
    <div className="a" style={{ display: "block" }}>
      <div className="a-login">
        <form onSubmit={async (e) => {
          e.preventDefault();
          setCargando(true);
          setError("");
          try { await entrar(email, pw); nav(loc.state?.desde ?? "/app/agenda", { replace: true }); }
          catch (err: any) { setError(err.status === 401 ? "Email o contraseña incorrectos" : err.message); }
          finally { setCargando(false); }
        }}>
          <h1>Gestión del estudio</h1>
          <div className="a-campo"><label htmlFor="em">Email</label><input id="em" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="a-campo"><label htmlFor="pw">Contraseña</label><input id="pw" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          {error && <p className="a-error" role="alert">{error}</p>}
          <button className="a-btn a-btn-p" disabled={cargando}>{cargando ? "Entrando…" : "Entrar"}</button>
        </form>
      </div>
    </div>
  );
}
