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

const inlineScriptHashes = INLINE_SCRIPTS.map(
  (source): `sha256-${string}` =>
    `sha256-${createHash("sha256").update(source).digest("base64")}`,
);

export default defineConfig({
  site: "https://rcn.sh",
  trailingSlash: "never",

  build: {
    format: "file",
  },

  output: "static",
  adapter: cloudflare({
    imageService: "compile",
  }),

  markdown: {
    syntaxHighlight: false,
  },

  security: {
    csp: {
      styleDirective: {
        resources: [{ resource: "'unsafe-inline'", kind: "attribute" }],
      },
      scriptDirective: {
        hashes: inlineScriptHashes,
        resources: SCRIPT_SOURCES,
      },
    },
  },

  integrations: [
    expressiveCode({
      themes: ["vitesse-dark"],
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
      assetsInlineLimit: (file) => (file.endsWith(".js") ? false : undefined),
    },
  },
});
