# Security audit — rcn.sh

**Status: all 10 findings fixed** (1 × P1, 5 × P2, 4 × P3). No P0 was found — no anonymous auth bypass, data leak, RCE or stored XSS.

Each finding was deleted from this file as it was closed. What remains is the "Verified clean" list, kept so a future audit does not re-litigate it, and a record of what changed.

**Originally verified empirically:** `npm run build` + `npx wrangler dev --port 8787` (remote R2/D1/KV bindings), then curl against 19 routes. Header parity across hard loads, middleware bypass on prerendered pages, rate-limit enforcement, CSRF origin enforcement, path-traversal rejection, the live R2 bucket contents, and Astro's own CSP/origin-check source in `node_modules`.

**Since verified (2026-09-11):** production TLS behaviour. `http://rcn.sh` answers `301 Moved Permanently` to `https://rcn.sh/` from `Server: cloudflare`, so the redirect happens at the edge and never reaches the Worker; HTTPS responses carry `strict-transport-security: max-age=63072000; includeSubDomains`. Whether that 301 comes from the *Always Use HTTPS* toggle or from an equivalent redirect rule is not visible from outside, and does not matter here — the behaviour is the same. `COOKIE_SECURE = !import.meta.env.DEV` still earns its keep regardless, since HSTS cannot protect a first-ever navigation.

---

## What changed

| Was | Fix |
|---|---|
| P1 — `/api/files/download` served arbitrary R2 objects same-origin with `Content-Disposition: inline`, echoing the stored content type | Route now 404s when `PUBLIC_BUCKET_URL` is set, making its own header comment true. The streaming path was also hardened for the ungated case: non-inert types are forced to `application/octet-stream` + `attachment`, and every response carries `Content-Security-Policy: sandbox`. `upload.rcn.sh` links are unaffected — R2's custom domain never touches the Worker. |
| P2 — `script-src 'unsafe-inline'` meant the CSP stopped no XSS | `<ClientRouter />` removed and `security.csp` enabled, so scripts are hash-locked. `style-src-attr 'unsafe-inline'` is carved out because CSP hashes do not apply to style attributes. The layout's `is:inline` script moved to `shared/inline-scripts.ts` so `astro.config.ts` hashes the identical string. |
| P2 — prerendered pages bypass the middleware, and nothing enforced header parity | `scripts/verify-headers.ts` fails the build if `dist/client/_headers` is missing, empty, or stale. Plus a test asserting the CSP stays route-invariant. |
| P2 — `/api/files/list` and the FilesRoot island did the same whole-tree KV read as `/api/files/search` on a 3× looser budget | `bucketFor` puts all of `/api/files/*` and `/_server-islands/FilesRoot` in `scan`; `SCAN_BUDGET` raised 40 → 80 to absorb them. |
| P2 — `/api/files/download` had no object-size cap | Closed with the P1: the route no longer answers. |
| P2 — session and OAuth-state cookies took `Secure` from the request scheme | `COOKIE_SECURE = !import.meta.env.DEV`, applied to both cookies. HSTS `preload` deliberately **not** added — irreversible for two years across every subdomain. |
| P3 — `/api/multiplayer/*` bypassed the middleware, so carried no security headers | The multiplayer Worker now applies `securityHeaders()` to every non-101 response. The `originAllowed` localhost branch was left ungated on purpose, so a locally-served page can still reach the production room for debugging. |
| P3 — three "checkOrigin covers this" comments were true only because CORS preflight closed the gap | Explicit `Origin !== url.origin → 403` in `src/lib/csrf.ts`, applied to `/api/guestbook/delete` and `/api/auth/logout`. All three comments corrected. |
| P3 — the public country histogram could single out a lone signer | Countries with fewer than `MIN_COUNTRY_COUNT` (3) signatures fold into `unplaced`. |
| P3 — expired session rows were swept only when somebody logged in | Sweep extracted to `sweepExpiredSessions()` and sampled from `getSession` (~1 request in 50), so it tracks traffic rather than logins. A Cron Trigger would need a `scheduled` export the Cloudflare adapter does not expose. |

---

## Verified clean

Recorded so a future audit does not re-litigate them.

- **Path traversal into R2 keys.** `/api/files/download?key=../../etc/passwd` → `400`; `?key=.hidden/x` → `404` (hidden-key rule, `src/lib/r2.ts:54-56`). `/api/files/list?prefix=../` and the URL-encoded form both return the ordinary public root listing, because `normalisePrefix` (`r2.ts:59-65`) maps a `..` segment to `""`. R2 keys are a flat namespace, so there is no filesystem to escape to regardless. *(The download route now 404s ahead of all of this while `PUBLIC_BUCKET_URL` is set.)*
- **SSRF.** Every outbound `fetch` targets a constant: `https://api.github.com` (`src/lib/github.ts:11`), `https://github.com/login/oauth/*` (`src/lib/auth.ts:24-25`), and `env.MUSIC_WAREHOUSE_URL` (`src/lib/spotify.ts:133`). No request-supplied value reaches a URL. `/api/spotify/top?range=` is allowlisted against `RANGES` (`top.ts:10-11`) — `?range=__proto__` correctly fell back to `long_term`.
- **Prototype pollution.** The only user-keyed object index found is `ICONS[name]` (`src/components/icons.ts`), and `name` comes from content config, not a request. `tree[prefix]` in `cachedDirectory` reads a plain object built in-process; a `__proto__` prefix returns a truthy non-listing but is normalised to `""` before it gets there.
- **shell-quote.** `^1.10.0`, well past the 1.7.3 fix for CVE-2021-42740. `parse()` runs client-side only on the user's own input (`src/lib/shell.ts:754`), inside a try/catch, and non-string operator tokens are explicitly rejected rather than coerced (`shell.ts:764-766`). `xdg-open` navigates only to `node.href` values baked into the server-generated `/shell-fs.json`, so there is no open redirect.
- **Rate limiting is live and enforced.** 15 rapid hits on `/api/auth/login` (AUTH_BUDGET 10/60): `302 302 302 302 302 302 302 302 302 302 429 429 429 429 429`. Keying is `cf-connecting-ip` (`src/lib/throttle.ts:74`), which Cloudflare sets at the edge and a client cannot forge — `X-Forwarded-For` is not consulted anywhere. The fail-open behaviour (`throttle.ts:100-103`) is a deliberate availability trade and is documented as such.
- **No secrets in the repository.** `git ls-files` matches no `.env` or `.dev.vars`; only `.dev.vars.example` is tracked, and both are gitignored.
- **Guestbook PII.** No IP is stored; `country` comes from `request.cf.country` with nothing finer, and is withheld from the public API by `toEntry`. No email — migration 0002 dropped the ones the old guestbook kept. React escapes rendered entries, and there is no `dangerouslySetInnerHTML` anywhere in `src/components/react/`. `decodeCursor` is a strict `/^(\d{1,15}):(\d{1,15})$/`; junk cursors fall back to page one. Disclosure and deletion are both handled in the UI.
- **The rest of the auth surface.** OAuth `state` is 256 bits from `crypto.getRandomValues`, compared before the code exchange. No open redirect in the callback — `redirect_uri` and `return_to` overrides all returned `Location: /guestbook?error=state`, because the destination is hardcoded. The session token is 256 bits and only its SHA-256 reaches D1, so a D1 leak cannot mint sessions. Logout deletes the row server-side. `/api/guestbook/delete` scopes its `DELETE` to `githubId = session.githubId`, so one user cannot delete another's entry.
- **Committed guestbook import.** `migrations/0002_import_old_guestbook.sql` hardcodes 13 real people's GitHub ids, logins, display names and avatar URLs in version control. All of it is public GitHub profile data that the guestbook renders publicly anyway, so this is not a leak — noting it only because it is personal data living in git history, where deletion via `/api/guestbook/delete` does not reach it.
