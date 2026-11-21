# 0027. Edge copies are kept in the Cache API and rebuilt on every hit

Cloudflare does not CDN-cache a Worker's responses on `cache-control` alone. Routes that need an edge copy (files search, guestbook list, now-playing) keep one per colo in the Cache API through `edgeCached` in `src/lib/edge-cache.ts`. The module is free of `cloudflare:workers`: `createEdgeCache` takes `open` and `waitUntil`, which `edge.ts` binds, so it tests under node.

A Response from the Cache API, or from `fetch()`, has immutable headers, and the middleware writes security headers onto every response. `edgeCached` rebuilds every hit into a new Response (`new Response(hit.body, hit)` by default, or the route's `fromHit`) before setting the policy. `finish()` in `src/middleware.ts` also catches a header write failure and rebuilds the Response before hardening, for any other immutable response that reaches it. The test fake in `src/lib/edge-cache.test.ts` returns Responses whose headers throw when written, reproducing the Cache API.

See ADR-0107.
