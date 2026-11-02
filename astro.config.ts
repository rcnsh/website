import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

import expressiveCode from "astro-expressive-code";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

import { unifyCsp } from "./scripts/csp-union.ts";
import { INLINE_SCRIPTS } from "./shared/inline-scripts.ts";
import { SCRIPT_SOURCES } from "./shared/security.ts";

// Astro never hashes an `is:inline` script, so hash them here from the same
// strings the layout renders — see CLAUDE.md § Maintenance › CSP and the router.
const inlineScriptHashes = INLINE_SCRIPTS.map(
  (source): `sha256-${string}` =>
    `sha256-${createHash("sha256").update(source).digest("base64")}`,
);

// https://astro.build/config
export default defineConfig({
  site: "https://rcn.sh",
  trailingSlash: "never",

  build: {
    format: "file",
  },

  // Static by default. Live data arrives via server islands, or routes that
  // opt out with `export const prerender = false`.
  output: "static",
  adapter: cloudflare({
    imageService: "compile",
  }),

  // Expressive Code does the highlighting and sets this itself, but only after
  // Astro's CSP check has already warned about the default Shiki highlighter.
  markdown: {
    syntaxHighlight: false,
  },

  // Hashed inline scripts, in a per-page <meta>. The csp-union integration
  // below rewrites every prerendered page's to the union of them all, which is
  // what lets <ClientRouter /> swap pages in. It is also why 'unsafe-inline'
  // must stay in the _headers policy — see CLAUDE.md § Maintenance › CSP and
  // the router.
  security: {
    csp: {
      // Required: CSP hashes do not apply to style *attributes*, so without
      // this every runtime `element.style.setProperty` is refused — the nav
      // underline included. `kind: "attribute"` confines it to style-src-attr,
      // leaving script-src hash-locked.
      styleDirective: {
        resources: [{ resource: "'unsafe-inline'", kind: "attribute" }],
      },
      scriptDirective: {
        hashes: inlineScriptHashes,
        // A new script host goes in SCRIPT_SOURCES, which feeds this meta and
        // the header both. Adding it to one alone does nothing.
        resources: SCRIPT_SOURCES,
      },
    },
  },

  integrations: [
    // Must be registered before anything that consumes Markdown: it installs
    // the syntax highlighter the pipeline uses. Overrides pass `var()` so
    // global.css stays the one place colours live — which means every setting
    // that would derive a colour needs an explicit value here instead.
    expressiveCode({
      themes: ["vitesse-dark"],
      // The site is dark-only, so there's no second theme to switch to.
      useDarkModeMediaQuery: false,
      styleOverrides: {
        borderRadius: "var(--radius-card)",
        borderWidth: "1px",
        borderColor: "var(--color-line)",
        codeBackground: "var(--color-surface)",
        codeFontFamily: "var(--font-mono)",
        codeFontSize: "0.8125rem",
        codeLineHeight: "1.7",
        codePaddingBlock: "0.875rem",
        codePaddingInline: "1rem",
        gutterBorderColor: "var(--color-line)",
        gutterForeground: "var(--color-ink-faint)",
        gutterHighlightForeground: "var(--color-ink-dim)",
        uiFontFamily: "var(--font-mono)",
        uiFontSize: "0.6875rem",
        frames: {
          // Flat — the page separates things with rules, not shadows.
          shadowColor: "transparent",
          frameBoxShadowCssValue: "none",
          editorBackground: "var(--color-surface)",
          editorTabBarBackground: "var(--color-base)",
          editorTabBarBorderColor: "var(--color-line)",
          editorTabBarBorderBottomColor: "var(--color-line)",
          editorActiveTabBackground: "var(--color-raised)",
          editorActiveTabForeground: "var(--color-ink-dim)",
          editorActiveTabBorderColor: "var(--color-line)",
          editorActiveTabIndicatorTopColor: "transparent",
          editorActiveTabIndicatorBottomColor: "var(--color-brand)",
          terminalBackground: "var(--color-surface)",
          terminalTitlebarBackground: "var(--color-base)",
          terminalTitlebarForeground: "var(--color-ink-dim)",
          terminalTitlebarBorderBottomColor: "var(--color-line)",
          terminalTitlebarDotsForeground: "var(--color-line-strong)",
          terminalTitlebarDotsOpacity: "1",
          inlineButtonForeground: "var(--color-ink-dim)",
          inlineButtonBorder: "var(--color-line-strong)",
          tooltipSuccessBackground: "var(--color-brand-deep)",
          tooltipSuccessForeground: "var(--color-ink)",
        },
      },
    }),
    react(),
    sitemap(),
    {
      name: "csp-union",
      hooks: {
        "astro:build:done": async ({ dir, logger }) => {
          const policy = await unifyCsp(fileURLToPath(dir));
          const hashes = policy.match(/'sha256-/g)?.length ?? 0;
          logger.info(`every prerendered page now carries one CSP (${hashes} hashes)`);
        },
      },
    },
  ],

  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },

  vite: {
    plugins: [tailwindcss()],
    build: {
      // Astro inlines a small, import-free page script as an inline module.
      // Under <ClientRouter /> that costs a hash in every page's CSP, and the
      // router waits for an inline module through a `data:` script the CSP
      // refuses, so its first page-load could run ahead of the script. Every
      // script ships as a file instead; other assets keep Vite's default.
      assetsInlineLimit: (file) => (file.endsWith(".js") ? false : undefined),
    },
  },
});
