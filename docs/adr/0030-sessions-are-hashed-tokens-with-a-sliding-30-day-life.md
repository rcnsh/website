# 0030. Sessions are hashed random tokens with a sliding 30-day life

A session token in `src/lib/auth.ts` is 256 random bits. The cookie carries the raw token, and D1 stores only its SHA-256 hash as the session id, so a leaked database cannot be used to mint or replay sessions.

A session lasts 30 days (`SESSION_TTL_MS`). When one is used with less than half its life left (`SESSION_REFRESH_MS`, 15 days), `getSession` extends it to a fresh 30 days. Active readers stay signed in without a database write on every request, since only a session past 15 days old is rewritten. Extending a session also rewrites the session cookie, and with it the owner hint, at the new expiry; otherwise the browser drops the cookie at its original expiry and ends a session the database still considers live.
