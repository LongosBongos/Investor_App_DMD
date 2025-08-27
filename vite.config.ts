import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// **Repo-Name** für GitHub Pages – ggf. anpassen:
const base = "/Investor_App_DMD/";

export default defineConfig({
  plugins: [react()],
  base,
});
