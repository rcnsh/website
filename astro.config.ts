import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import expressiveCode from "astro-expressive-code";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://rcn.sh",
  trailingSlash: "never",

  // Static by default. Live data arrives via server islands, or routes that
  // opt out with `export const prerender = false`.
  output: "static",
  adapter: cloudflare({
    imageService: "compile",
  }),

  integrations: [
    /*
      Code blocks in posts. Must be registered before anything that consumes
      Markdown, since it installs the syntax highlighter the pipeline uses.

      vitesse-dark is the closest bundled theme to this palette — low
      saturation, warm foreground — and every piece of chrome around the code
      is repointed at the site's own tokens below, so a block reads as part of
      the page rather than a screenshot of an editor. Passing `var()` rather
      than hex keeps global.css the one place colours are defined; the settings
      whose defaults derive a colour from an overridden one (shadow, tab bar,
      gutter) are all given explicit values here, since colour maths can't run
      on a custom property.
    */
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
  ],

  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
