import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En desarrollo, /api y /media van a la API local (igual que Nginx en producción)
const proxy = {
  "/api": { target: "http://localhost:8000", rewrite: (p: string) => p.replace(/^\/api/, "") },
  "/media": "http://localhost:8000",
};

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
