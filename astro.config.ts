import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://rcn.sh",
  trailingSlash: "never",

  // Static by default — every page ships as a prerendered shell and the live
  // bits (Spotify, GitHub, R2, guestbook) arrive via server islands or routes
  // that opt out with `export const prerender = false`.
  output: "static",
  adapter: cloudflare({
    imageService: "compile",
  }),

  integrations: [react(), sitemap()],

  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
