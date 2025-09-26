// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Repo-Name exakt wie bei GitHub (Groß/Klein!)
const BASE = "/Investor_App_DMD/";

export default defineConfig(({ command }) => ({
  // Dev (serve) => "/"   ·   Build/Pages (build) => "/Investor_App_DMD/"
  base: command === "serve" ? "/" : BASE,
  plugins: [react()],
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
  resolve: {
    alias: {
      stream: "stream-browserify",
      crypto: "crypto-browserify",
      buffer: "buffer",
    },
  },
  define: {
    "process.env": {},
    global: "window",
  },
  server: {
    port: 5173,
    open: true,
  },
}));

