# 0014. State-changing routes require a same-origin Origin header

Astro's `security.checkOrigin` exempts requests whose content type is not form-like, so a cross-origin JSON POST reaches the handler, and only the absence of CORS headers stops it. State-changing routes therefore also require the `Origin` header to be present and equal to the request's own origin (`sameOrigin` in `src/lib/csrf.ts`), a check that does not depend on CORS.

`/api/auth/logout` accepts only POST and requires `sameOrigin`. A GET logout link would let any page sign the visitor out.
