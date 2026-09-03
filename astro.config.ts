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

  build: {
    format: "file",
  },

  // Static by default. Live data arrives via server islands, or routes that
  // opt out with `export const prerender = false`.
  output: "static",
  adapter: cloudflare({
    imageService: "compile",
  }),

  /*
    `security.csp` is deliberately NOT enabled. It is the obvious thing to
    reach for here and it breaks the site.

    Astro hashes the inline scripts it emits and publishes them in a <meta>
    Content-Security-Policy. A meta CSP binds the document it was parsed with,
    and <ClientRouter /> does not parse a new one — it swaps the contents of
    the existing document. So after the first soft navigation the entry page's
    hash list is still the policy being enforced, every later page's island
    hydration scripts hash to something that is not on it, and they are
    blocked. Astro's router has no CSP handling to reconcile the two.

    The failure is invisible from a direct page load, which is what makes it
    worth this comment: /music and /files render perfectly when their URL is
    opened, and lose MusicExplorer and FileBrowser when reached from the nav.

    So it is view transitions or hashed inline scripts, not both, and the
    transitions are a feature people can see. If this is ever revisited, the
    options are to drop <ClientRouter /> from Layout.astro, or to give every
    page the union of all pages' hashes via csp.scriptDirective.hashes — which
    needs a two-pass build and silently breaks the day someone forgets the
    second pass.

    shared/security.ts carries the header policy in the meantime.
  */

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
