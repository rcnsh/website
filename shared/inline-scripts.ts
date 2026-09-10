/*
  Inline scripts that must run before first paint, kept here as strings rather
  than in the .astro template.

  The reason is CSP. `is:inline` tells Astro not to process a script, and an
  unprocessed script is one Astro never hashes — so with `security.csp` on, an
  is:inline script is absent from every generated policy. Prerendered pages get
  away with it by accident: Astro injects its <meta> CSP after this script in
  <head>, and a meta policy does not govern content that precedes it. Routes
  with `prerender = false` get a real header instead, which governs the whole
  document, and there the script is blocked outright.

  Keeping the source here means astro.config.ts can hash the exact same string
  it renders, so the two can never drift. Change the script and the hash
  follows on the next build; there is no second place to remember.
*/

/**
 * Reduce motion, decided before anything paints. Inline and unbundled: a module
 * script runs after layout, by which time the masthead has already animated.
 * lib/prefs.ts owns the same logic; change both together.
 */
export const MOTION_BOOTSTRAP = `
      (() => {
        const apply = () => {
          try {
            const stored = localStorage.getItem("rcn:motion");
            const reduce =
              stored === "reduce" ||
              (stored !== "full" &&
                matchMedia("(prefers-reduced-motion: reduce)").matches);
            document.documentElement.dataset.motion = reduce ? "reduce" : "full";
          } catch {
            // Storage is walled off. Leaving the attribute unset is what hands
            // the decision back to the media query in global.css.
          }
        };

        apply();
      })();
    `;

/** Every inline script the layout renders, in no particular order. */
export const INLINE_SCRIPTS = [MOTION_BOOTSTRAP];
