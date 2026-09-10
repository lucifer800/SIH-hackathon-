import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The farmer PWA talks to the KisanQ API at /api/v1. In dev we proxy that to the
// Fastify server on :3000 so the app runs same-origin (no CORS dance).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
    },
  },
});
