# 0012. Security headers come from one module, generated into _headers

Prerendered pages are served as static assets and never reach the middleware, so their only source of security headers is `public/_headers`. Everything else gets its headers from `src/middleware.ts`. Two hand-kept copies would drift and leave one surface weaker.

`shared/security.ts` (`securityHeaders`, `headersFile`) is the single source. It is plain TypeScript with no Astro-isms, because Vite, bare Node scripts and `astro.config.ts` all load it. `scripts/generate-headers.ts` (`npm run headers`, part of `generate`, run ahead of dev, build and preview) writes `public/_headers` from it, and the file is gitignored rather than committed so no stale copy exists. The generated file always holds the production header set: it is generated ahead of dev too, but the file is what production serves, so it never carries a dev-only policy. `shared/security.test.ts` asserts that the generated `_headers` and the middleware's header set are the same.

`npm run build` ends with `verify:headers` (`scripts/verify-headers.ts`), which fails if `dist/client/_headers` is missing or stale. Because the file is generated and gitignored, nothing else notices if it goes missing.
