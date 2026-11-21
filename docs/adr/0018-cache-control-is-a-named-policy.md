# 0018. Every Cache-Control is a named policy

A route that types its own `Cache-Control` string gives the edge and browsers an instruction nobody reviews as a policy. Every `Cache-Control` value is built by a named builder in `shared/cache-policy.ts` (`publicFor`, `noStore`, `uncachedError`, `privateNoStore`, `serverIslands`, `staticAssets`). The module is dependency-free, so the `_headers` generator, the middleware and the routes share one vocabulary. Each public route's policy is an entry in the `policies` table in `src/lib/http.ts`.

The builders' output strings are pinned exactly in `shared/cache-policy.test.ts`, and `src/lib/http.test.ts` pins every public route's string. A change to either is a change to what browsers and the edge are told, so it shows up in review as a test change.
