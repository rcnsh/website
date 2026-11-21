# 0083. Guestbook write routes check origin themselves and delete only the signer's rows

Astro's `security.checkOrigin` only inspects form-like content types, so a request with any other body reaches the handler unchecked (see `src/lib/csrf.ts`). `/api/guestbook/sign` and `/api/guestbook/delete` are POST-only and run an explicit `sameOrigin` check first, answering `forbidden()` on a mismatch.

Both parse the body inside a `try`. A same-origin JSON or octet-stream body makes `formData()` throw, which without the `try` is a 500; the sign route returns the `empty` error instead, which redirects to `/guestbook?error=empty#gb-sign`. The delete route redirects to `/guestbook` on a body it cannot parse.

The delete matches both the entry id and the session's `githubId`. A signer may delete only their own entries, and the row id alone comes from the client.

See ADR-0014.
