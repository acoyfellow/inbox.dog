import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare(), tailwindcss()],
  optimizeDeps: {
    // Workaround for Vite 7.1.3+ with Cloudflare plugin (cloudflare/workers-sdk#10702)
    ignoreOutdatedRequests: true,
  },
  define: {
    __filename: "'index.ts'",
  },
  server: {
    allowedHosts: true,
  },
});
