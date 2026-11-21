# 0031. The owner hint cookie reveals controls and grants nothing

Prerendered pages and publicly cached islands cannot ask who is reading, so the owner's controls are revealed by a non-HttpOnly owner hint cookie that scripts read through `hasOwnerHint()` (`src/lib/owner-hint.ts`). No permission is ever granted on it: every owner check reads the session, so forging the cookie only shows controls the server then refuses.

The hint lives and dies with the session, so it neither outlives a sign-out nor expires early. `writeSessionCookie` (`src/lib/session-cookie.ts`) is the session cookie's only writer, and it sets the hint with the session cookie's expiry or deletes it. `getSession` (`src/lib/auth.ts`) re-issues a missing hint for the owner with the session's current expiry, since a hint lost while the session lives would otherwise hide the owner's controls until the next sign-in. Every refusal from the owner guard deletes the hint, because a stale one keeps showing controls the server refuses.

The download route's owner check and the `/api/files/visibility` probe both go through `requireOwner`, so their refusals delete a stale hint too. This keeps the hint from outliving the session, and a stale hint then costs the /files page only one held load before the probe clears it.
