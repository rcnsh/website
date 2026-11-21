# 0008. Inline scripts are registered in shared/inline-scripts.ts

Astro never hashes an `is:inline` script; that is what `is:inline` means. Such a script is still needed where code must run before anything else, such as the motion bootstrap in `src/layouts/Layout.astro`.

Every `is:inline` script's body is exported from `shared/inline-scripts.ts` (`INLINE_SCRIPTS`, and named exports such as `MOTION_BOOTSTRAP`) and rendered with `set:html` from there. `astro.config.ts` computes the sha256 of each string in `INLINE_SCRIPTS` and passes them to Astro's `scriptDirective.hashes`. Hashing the exact string the layout renders is the only way such a script is allowed by the meta CSP on prerendered pages and by the header CSP on `prerender = false` routes.

A script that shares logic with bundled code takes it from a module by `toString()`: `MOTION_BOOTSTRAP` splices in `resolveMotion` from `shared/motion.ts`, which `src/lib/prefs.ts` also calls. `astro.config.ts` loads the module through Vite's dev SSR transform and the page renders it from the rolldown bundle; the two print a block statement differently (the dev transform adds `;` after it), so a function spliced in this way is a single expression with its type on the `const`, and anything needing a block (the `try` around storage) stays in the template's literal text. `src/lib/prefs.test.ts` pins that `resolveMotion` has no braces or semicolons.

## Consequences

An unregistered `is:inline` script fails the build on a prerendered page (the `csp-union` check) and is blocked on any `prerender = false` route, where the policy is a real header.

See ADR-0007.
