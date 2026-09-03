import { defineConfig } from "astro/config";
import type { AstroUserConfig } from "astro";
import cloudflare from "@astrojs/cloudflare";
import { baseDirectives } from "./shared/security.ts";

/**
 * Astro narrows a CSP directive to a template literal union; shared/security.ts
 * returns plain strings, because bare Node loads it for the header generator
 * and it therefore imports nothing Astro-shaped. Same strings, one cast.
 */
type CspDirectives = NonNullable<
  Extract<NonNullable<AstroUserConfig["security"]>["csp"], object>["directives"]
>;
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

  security: {
    /*
      A second, stricter Content-Security-Policy, emitted as a <meta> element
      in every page Astro renders.

      The header set in shared/security.ts cannot be strict about scripts: it
      is one string written ahead of time, and the inline scripts Astro emits
      to hydrate islands and drive the view transitions are not knowable when
      it is written — which is why it carried 'unsafe-inline', and why the
      policy could not have contained an injection if there had ever been one
      to contain.

      Astro knows those scripts, because it emitted them. Turning this on makes
      it hash each one and name the hashes in the meta element. A browser
      enforces the header and the meta together, so the effective policy is the
      stricter of the two: Astro's own inline scripts run, and an injected one
      does not. See the comment on contentSecurityPolicy for why the header
      stays permissive rather than being tightened alongside this.

      `directives` repeats everything the policy says that is not about scripts
      or styles, from the same function the header uses, so the two agree.
      Production values: this is read at build time, and the dev-only
      multiplayer origins have no business in a shipped page.
    */
    csp: {
      directives: baseDirectives() as CspDirectives,
      styleDirective: {
        /*
          Style *attributes*, specifically — `style={{ width: `${pct}%` }}` on
          the now-playing progress bar, the file browser's indentation, the
          map's per-country opacity. They are computed from data at render
          time, so there is no fixed string to hash, and no way to express
          them as a class either.

          Scoped to `attribute` so it stays off `style-src` proper: an inline
          <style> block still has to hash, which is where a style injection
          would actually go.
        */
        resources: [{ resource: "'unsafe-inline'", kind: "attribute" }],
      },
    },
  },
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
