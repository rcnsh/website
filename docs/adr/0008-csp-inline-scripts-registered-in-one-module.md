# 0008. Inline scripts are registered in shared/inline-scripts.ts

Astro never hashes an `is:inline` script; that is what `is:inline` means. Such a script is still needed where code must run before anything else, such as the motion bootstrap in `src/layouts/Layout.astro`.

Every `is:inline` script's body is exported from `shared/inline-scripts.ts` (`INLINE_SCRIPTS`, and named exports such as `MOTION_BOOTSTRAP`) and rendered with `set:html` from there. `astro.config.ts` computes the sha256 of each string in `INLINE_SCRIPTS` and passes them to Astro's `scriptDirective.hashes`. Hashing the exact string the layout renders is the only way such a script is allowed by the meta CSP on prerendered pages and by the header CSP on `prerender = false` routes.

A script that shares logic with bundled code repeats it as literal source rather than splicing a function in by `toString()`: `astro.config.ts` loads modules through Vite's dev SSR transform while the page renders from the rolldown bundle, and the two can print the same function differently, which moves the hash. `MOTION_BOOTSTRAP` writes the reduce-motion rule out in full, and `src/lib/prefs.test.ts` runs the bootstrap string against `resolveMotion` (`shared/motion.ts`) for every stored value and media state, so the copy cannot drift.

## Consequences

An unregistered `is:inline` script fails the build on a prerendered page (the `csp-union` check) and is blocked on any `prerender = false` route, where the policy is a real header.

See ADR-0007.
