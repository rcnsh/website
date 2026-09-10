// Every `is:inline` script lives here so astro.config.ts can hash the exact
// string the layout renders. An unregistered one is blocked on any
// `prerender = false` route — see CLAUDE.md § Maintenance › CSP and the router.

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
