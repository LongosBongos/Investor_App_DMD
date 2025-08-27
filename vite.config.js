// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // WICHTIG für GitHub Pages: Repo-Name als Base-Pfad
  base: '/Investor_App_DMD/',
})

