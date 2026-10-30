import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

const grapesDev: ProxyOptions = {
  target: "http://127.0.0.1:3001",
  changeOrigin: false,
  ws: true,
};

const grapesPublic: ProxyOptions = {
  target: "http://127.0.0.1:3001",
  changeOrigin: false,
  rewrite: (path) => `/grapes${path}`,
};

const sugarcaneDev: ProxyOptions = {
  target: "http://127.0.0.1:3002",
  changeOrigin: false,
  ws: true,
};

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // When deployed behind one domain (Render + nginx), gateway is served under /login/
  base: mode === "production" ? "/login/" : "/",
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    allowedHosts: [
      "localhost",
      ".ngrok-free.dev",
      ".ngrok.io",
      ".ngrok.app",
    ],
    proxy: {
      // One ngrok tunnel → gateway, then grapes/sugarcane Vite apps.
      "/grapes": grapesDev,
      "/sugarcan": sugarcaneDev,
      "/Image": grapesPublic,
      "/Pest.json": grapesPublic,
      "/fertilizer.json": grapesPublic,
      "/irrigation.json": grapesPublic,
      "/grape-farm-record-book.pdf": grapesPublic,
      "/location-data-part1.json": grapesPublic,
    },
  },
}));
