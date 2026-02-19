import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    // Use our SESSIONS KV; avoid separate SESSION binding
    sessionKVBindingName: "SESSIONS",
  }),
});
