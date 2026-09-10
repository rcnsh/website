# Performance audit — rcn.sh

**Status: all 10 findings resolved** (3 × P1, 4 × P2, 3 × P3). No P0.

Seven were fixed, one had already been closed by the reliability work, and two were closed as "no action" — one of them by the auditor's own recommendation. Each was deleted from this file as it was settled.

**Cold start was never the problem.** `wrangler check startup` reported 18.1 ms against a 1 s budget — 1.8% of the limit. Nothing here is a cold-start fix, and the server bundle deliberately was not shrunk.

---

## What changed

| Was | Fix |
|---|---|
| **P1** — `/guestbook` was 48,412 B per view, 60% of it an inline world map, on the one route that can never be edge-cached because it renders differently for the signer. The most expensive fragment on the site was re-rendered and re-sent on every view, forever. | The map moved into its own `server:defer` island. It reads nothing but a country histogram, so as a separate request it is public, identical for everyone, and cacheable. **Measured: document 48,412 → 9,370 B brotli**, with the 118,719 B map now a separately cached fragment carrying `s-maxage=300`. It takes no props on purpose — server-island props are encrypted into the `?e=` parameter, so passing the counts in would make the URL change with the data and defeat the caching it exists for. |
| **P1** — server-island responses carried no cache headers, so the homepage paid 3 uncacheable Worker round trips per view. | `public, max-age=60, s-maxage=300, stale-while-revalidate=3600` from the middleware for `/_server-islands/*`. Everything behind them is already stale-while-revalidated in KV on a 30–60 minute clock, so a 5-minute edge TTL is strictly fresher than the data it serves. Verified on all three homepage islands. |
| **P1** — every HTML document was `max-age=0, must-revalidate`, so each navigation paid a full round trip. | `public, max-age=0, s-maxage=600, stale-while-revalidate=86400` in `headersFile()`. The edge answers without an origin trip while the browser still revalidates, so a deploy is visible immediately to anyone who reloads. This got more valuable after the CSP work removed `<ClientRouter />`: every navigation is now a full document load. |
| **P2** — `/music` hydrated `NowPlaying` with `client:load`, putting 57.7 KB of React on the critical path. | `client:idle` there and on the two islands with the same pattern (`TopMusic`, `FilesRoot`). All verified still hydrating. |
| **P2** — `/api/spotify/now-playing` cannot be edge-cached: the route advances `progressMs` by the cache entry's age, so an edge-served copy would make the bar rewind. | Poll raised 20s → 30s, **plus an immediate refresh the moment locally-interpolated progress reaches the track's duration** — which is the one moment a slower cadence would actually show, a finished track sitting under a full bar. Steady state drops from 3 polls/min to 2, a 33% cut in the site's baseline Worker invocations, without the card feeling any less live. |
| **P2** — `/guestbook` downloaded a second stylesheet 98.8% identical to the cached one. | Accepted, as the audit recommended: 8 KB on one page is not worth chasing through Vite's `cssCodeSplit` config. Its "correct version" — prerendering the page — is not available, see below. |
| **P2** — `cached()` had no request coalescing. | Already closed by the reliability work: `lib/coalesce.ts`, five tests, including that a rejection must not poison the key. |
| **P3** — critical-path fonts are 52,528 B. | No action, on the auditor's own reasoning: nothing is broken, the estimated 14–17 KB saving was explicitly "literature, not measurement", and the fix means adding a Python/fontTools step to a build that has no Python in it. |
| **P3** — the LCP element sits inside an entrance animation starting at `opacity: 0`, and Chrome does not count a fully transparent element as painted. | `from { opacity: 0.01 }`. Invisible, counts as painted. Roughly one frame, and genuinely a micro-optimisation — taken only because it is one line. |
| **P3** — 72% of the server bundle is evaluated at startup. | No action, and recorded so nobody re-investigates. 18.1 ms of a 1 s budget. `limits.cpu_ms: 500` is a per-request ceiling accounted separately from startup, so it does not squeeze this either. |

### Why `/guestbook` was not prerendered

The audit's larger suggestion for the map, and the "correct version" of the stylesheet finding, both point at making `/guestbook` a prerendered page with the personalised parts in an island. That does not work here: the page's entries and totals come from `getPage()` and `getStats()` at request time, and prerendering would bake them at build, freezing the guestbook until the next deploy. It also handles its own form POST, which a static route cannot.

Lifting the map out achieves what that was reaching for — the expensive, non-personalised fragment becomes independently cacheable — without freezing the page's content.

### Why the document itself is still uncached

`/guestbook` renders differently for the signer, and Cloudflare's default cache key ignores cookies. A `public` header on the anonymous branch would put an anonymous copy at the edge and then serve it to signed-in readers, showing a sign-in prompt to someone holding a valid session. Making that safe needs a cache key that varies on the session cookie, which is zone configuration rather than anything in this repository. The middleware says so at the point where someone would otherwise add it.

### The invariant this introduced

Server islands are now edge-cacheable as a class. That is safe only because every island on the site renders public data — GitHub stats, the contribution calendar, repos, the bucket root, listening history, the guestbook's country map. **If an island ever needs the session, it must be excluded from that branch in `src/middleware.ts`**, or the edge will serve one reader's fragment to another. The comment there says this; there is no test that enforces it.

---

## Measured after

Per-route document transfer, brotli, with the cache header each one now carries:

| Route | Document | Cache-Control |
| --- | --- | --- |
| `/` | 9,765 B | `public, max-age=0, s-maxage=600, stale-while-revalidate=86400` |
| `/blog` | 5,796 B | same |
| `/music` | 8,898 B | same |
| `/files` | 6,322 B | same |
| `/uses` | 17,497 B | same |
| `/404` | 5,835 B | same |
| `/guestbook` | **9,370 B** (was 48,412) | none — personalised, see above |

Homepage server islands all carry `public, max-age=60, s-maxage=300, stale-while-revalidate=3600`. Signed-in `/guestbook` still carries `private, no-store`, and anonymous `/guestbook` still carries nothing — both confirmed by request.
