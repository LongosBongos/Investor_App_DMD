// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// *** WICHTIG ***
// Repo-Name exakt wie bei GitHub (Groß/Klein!):
const BASE = "/Investor_App_DMD/";

export default defineConfig({
  base: BASE,
  plugins: [react()],
  // optional – macht Build robuster, keine Pflicht
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
  // optional – verhindert nervige Node-Polyfill-Resolves (nur Warnungen)
  resolve: {
    alias: {
      stream: "stream-browserify",
      crypto: "crypto-browserify",
    },
  },
  define: {
    "process.env": {},
    global: "window",
  },
});

