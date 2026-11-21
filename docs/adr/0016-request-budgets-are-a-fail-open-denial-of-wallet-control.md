# 0016. Request budgets are a fail-open denial-of-wallet control, sized to each route's cost

The site meters per-client request budgets with Workers rate-limit bindings (`SCAN_BUDGET`, `AUTH_BUDGET`, `API_BUDGET`), each its own namespace limited per minute, spent by `throttle` in `src/lib/throttle.ts`. It is a denial-of-wallet control, not a security control: the routes are public. Counters are per Cloudflare location, so it bounds one host, not a botnet; a distributed flood needs a WAF rule. See `docs/abuse.md`.

Callers are keyed by `cf-connecting-ip`. It cannot be spoofed from outside, and it is an IP rather than a user id on purpose, because the flood is what is metered. The limits are loose enough that carrier NAT does not trip them. `throttle` reads the client IP before touching `env` and returns early without one, since `cf-connecting-ip` is absent when prerendering and under `astro dev`, exactly where the bindings do not exist.

Any limiter error lets the request through. A cost control that can take the site down when it misfires is worse than the bill it prevents. A refusal is a 429 with `retry-after: 60`. `throttle` builds it with the `noStore` policy and the middleware sends it as `privateNoStore` (see ADR-0020), so it is never cached and served to someone else.

`wrangler.jsonc` defines the three budgets, per minute and per Cloudflare location, sized well above what the site's own JavaScript asks for: `API_BUDGET` 120/min (namespace 1001), `SCAN_BUDGET` 80/min (1002) and `AUTH_BUDGET` 10/min (1003). `namespace_id` is account-wide, not per Worker, so the ids must not collide with other Workers'.

`bucketFor` in `src/lib/throttle.ts` assigns routes, checking specific paths before the catch-all prefixes. Every route that reads and parses the whole cached bucket tree out of KV, which dominates its cost, spends from the scan budget: `/api/files/*` and the `FilesRoot` server island. The exceptions are `/api/files/meta`, `/api/files/thumbs` and `/api/files/download`, which spend from the api budget: they are per-object routes that never read the tree, and download especially, because the owner's private media plays through it one ranged read at a time. `/api/auth/*` spends from the auth budget, and everything else from api.

`SCAN_BUDGET` is tight because each request reads the whole tree, but it has to clear a human clicking through folders, since the browser lazy-loads one directory per expansion. `AUTH_BUDGET` is 10 because the OAuth round trip writes D1 rows and a human does it about once.
