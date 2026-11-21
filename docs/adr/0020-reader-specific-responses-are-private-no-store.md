# 0020. Responses for one reader are private, no-store

A response rendered for one reader (the owner, a session, a throttled caller) is nobody else's to see. No shared cache may hold it, and the browser should not keep it either, so it gets `privateNoStore` (`private, no-store`, `shared/cache-policy.ts`).

`src/middleware.ts` stamps this from the request rather than trusting each route: owner responses get `ownerCacheControl(locals)`, any other request carrying the session cookie gets `privateNoStore`, and an anonymous Worker render gets no `Cache-Control` from the middleware. Anonymous dynamic renders are not publicly cached by default either, only through a named route policy.

`throttle()` runs in the middleware before `next()`, and its 429 goes out with `privateNoStore`. Every route past that point spends money (D1, KV, upstreams), so a refusal issued there costs a request and nothing else.
