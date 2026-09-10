import { createHash } from "node:crypto";

import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

import expressiveCode from "astro-expressive-code";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

import { INLINE_SCRIPTS } from "./shared/inline-scripts.ts";

/*
  Astro hashes the scripts it processes, but never an `is:inline` one — that is
  what is:inline means. Hashing them here from the same strings the layout
  renders is what keeps `prerender = false` routes working: those get a real
  CSP header, which governs the whole document, where a prerendered page's
  <meta> policy only governs what follows it.
*/
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

  /*
    Hashed inline scripts, enforced.

    This was off, and the comment here explained why: Astro publishes the
    hashes of the inline scripts it emits in a <meta> Content-Security-Policy,
    a meta CSP binds the document it was parsed with, and <ClientRouter /> does
    not parse a new one — it swaps the contents of the existing document. So
    after the first soft navigation the entry page's hash list was still the
    policy being enforced, and every later page's island hydration scripts
    hashed to something not on it. /music and /files rendered perfectly when
    their URL was opened and lost MusicExplorer and FileBrowser when reached
    from the nav.

    That was a real constraint, and the resolution was to give up the feature
    on the other side of it: <ClientRouter /> is gone from Layout.astro, so
    every navigation is a document load that parses its own policy, and the
    hashes are correct by construction. The security audit's finding was that
    `script-src 'unsafe-inline'` left the CSP with no XSS mitigation at all —
    it was a same-origin resource policy and nothing more.

    Three things follow, and all three are load-bearing:

    1. Nothing may reintroduce <ClientRouter />, or the original bug returns.
       The `astro:page-load` event it dispatches is also gone, so TopBar,
       CommandPalette and SettingsMenu now self-invoke; ClockTile no longer
       needs its before-swap teardown.

    2. `script-src 'unsafe-inline'` stays in shared/security.ts, and removing
       it would break the site. Prerendered routes are served by Static Assets
       with the header from _headers AND Astro's <meta> with the hashes, and a
       browser enforces both — a script must satisfy every policy present. The
       header is the permissive floor and the meta is what actually binds. Take
       'unsafe-inline' out of the header and prerendered pages become
       header(no inline) ∩ meta(hashes) = no inline script at all.

    3. /guestbook is `prerender = false`, so Astro gives it a header rather
       than a meta (the Cloudflare adapter declares no staticHeaders feature,
       so the destination falls back to prerender ? "meta" : "header").
       middleware.ts preserves a route-set CSP rather than clobbering it, which
       is what lets that through.
  */
  security: {
    csp: {
      /*
        Scripts are hashed, which is the whole point of turning this on.

        Styles need a carve-out. Astro hashes inline <style> elements the same
        way, and CSP hashes do not apply to style *attributes* — so with a bare
        `csp: true` every runtime `element.style.setProperty(...)` is refused,
        which is not a theoretical set: it is the nav underline placing itself
        (TopBar's --nav-x/--nav-w), and anything else that writes a custom
        property onto an element. The console fills with "Applying inline style
        violates..." and the chrome quietly stops moving.

        `kind: "attribute"` puts 'unsafe-inline' on `style-src-attr` only, so
        style attributes and CSSOM writes are allowed while `style-src` keeps
        the hashes for real <style> elements. Loosening styles is a much
        smaller concession than loosening scripts: a style injection cannot
        execute, and script-src is still hash-locked.
      */
      styleDirective: {
        resources: [{ resource: "'unsafe-inline'", kind: "attribute" }],
      },
      scriptDirective: {
        hashes: inlineScriptHashes,
      },
    },
  },

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
