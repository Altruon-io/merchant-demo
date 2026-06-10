import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite configuration for the Merchant Demo frontend.
 *
 * The dev server proxies every /api/* request to the demo's Express backend
 * (server/, default port 4242). This means:
 *   - the browser only ever talks to ONE origin (no CORS in development)
 *   - the Altruon SECRET key stays on the backend — the frontend never sees it
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3030,
    proxy: {
      "/api": {
        target: "http://localhost:4242",
        changeOrigin: true,
      },
    },
  },
});
