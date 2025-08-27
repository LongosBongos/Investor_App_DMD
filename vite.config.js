// vite.config.js
import react from '@vitejs/plugin-react'

export default {
  plugins: [react()],
  // sehr wichtig für GitHub Pages (Repo-Name als Base-Pfad)
  base: '/Investor_App_DMD/',
}
