// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const BASE = "/Investor_App_DMD/";

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : BASE,
  plugins: [
    react(),
    nodePolyfills({
      protocolImports: true,
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
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
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["buffer", "process"],
  },
  server: {
    port: 5173,
    open: true,
  },
}));

