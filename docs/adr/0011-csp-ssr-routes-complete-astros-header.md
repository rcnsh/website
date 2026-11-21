# 0011. Middleware completes an SSR route's CSP instead of replacing it

On a `prerender = false` page (for example `/blog/edit`) Astro sends a per-response CSP header naming only that page's hashed scripts. It carries only `script-src` and `style-src`. Passed through unchanged, the page has no `default-src`, `base-uri`, `object-src` or `form-action`. Overwritten with the site's policy, it loses its hashes: that hashed `script-src` is the strictest policy on the site, and the site's carries `'unsafe-inline'`.

`harden()` in `src/middleware.ts` passes an existing route CSP to `completePolicy(existing)` in `shared/security.ts`, which adds every directive from `baseDirectives()` plus `frame-ancestors 'none'` that the route's policy lacks and leaves the directives it carries unchanged. Only a response without a CSP gets the full site policy. `shared/security.test.ts` covers completing Astro's own header on these pages.
