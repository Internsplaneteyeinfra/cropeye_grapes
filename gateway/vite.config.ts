import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // When deployed behind one domain (Render + nginx), gateway is served under /login/
  base: mode === "production" ? "/login/" : "/",
  server: {
    port: 5174,
    strictPort: true,
  },
}));

