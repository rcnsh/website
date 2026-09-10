# rcn.sh

Personal site. Astro 7 (static by default, server islands for live data) on
Cloudflare Workers, with D1, R2 and KV. A second Worker under
`workers/multiplayer/` serves cursor presence over Durable Objects.

```
npm run dev        # astro dev, port 4321
npm run build      # generate → wrangler types → astro check → astro build → verify:headers
npm test           # node --test over src/, shared/, workers/
npm run lint       # biome lint (NOT format — the repo is not biome-formatted)
npm run preview    # build, then wrangler dev on the real bindings
```

`npm run deploy` does **not** run migrations. D1 schema changes need
`npm run db:migrate:remote` separately.

---

<!-- MAINTENANCE -->
## Maintenance

Things that will break if you change them without knowing why. Most were paid
for once already; the comment in the code may be short or gone, so this is the
record.

### CSP and the router

**The one rule underneath all of this:** prerendered pages carry *two* policies
— the `_headers` one and Astro's `<meta>` — and a browser enforces both. What
runs is their **intersection**. A permission present in only one of them is not
a permission. Both known CSP bugs here were that mistake.

**Do not reintroduce `<ClientRouter />`.** `security.csp` is enabled, so Astro
publishes per-page inline-script hashes in a `<meta>` policy. A meta CSP binds
the document it was parsed with, and a view-transition swap does not reparse
it — so from the second soft navigation onward every page's island hydration
hashes to something absent from the entry page's list and is blocked. Invisible
on a direct load, which is what makes it expensive to diagnose.

Consequences already absorbed: `astro:page-load` is not dispatched without the
router, so `TopBar`, `CommandPalette` and `SettingsMenu` self-invoke instead of
binding to it. `ClockTile` needs no swap teardown.

**`script-src 'unsafe-inline'` must stay in `shared/security.ts`.** A browser
enforces every policy present, and prerendered pages carry both the `_headers`
policy and Astro's `<meta>`. The header is the permissive floor; the meta
hashes are what actually bind. Remove `'unsafe-inline'` and prerendered pages
become `header(no inline) ∩ meta(hashes)` — no inline script at all.

**A new script host goes in `SCRIPT_SOURCES` (`shared/security.ts`), never in
one policy alone.** Both surfaces read that list: `astro.config.ts` feeds it to
`scriptDirective.resources` for the meta, and `contentSecurityPolicy()` feeds
it to the header. Adding a host to only the header does nothing — the header is
the permissive floor and the meta is what binds, so the intersection still
refuses it. That is exactly how the Cloudflare Web Analytics beacon came to be
blocked on every prerendered page while the header named it and the test
asserting on the header stayed green.

`'self'` is in that list deliberately: Astro's `resources` *replaces* its
default rather than extending it, so dropping it would take every same-origin
script out of the meta policy.

**`style-src-attr 'unsafe-inline'` is required** (`astro.config.ts`). CSP
hashes do not apply to *style attributes*, so without it every runtime
`element.style.setProperty` is refused — including the nav underline placing
itself.

**A new `is:inline` script must be registered in `shared/inline-scripts.ts`.**
Astro never hashes an `is:inline` script; that is what `is:inline` means. One
that is not registered still *works* on prerendered pages by accident — the
meta tag is injected after it in `<head>`, and a meta policy does not govern
what precedes it — and fails on any `prerender = false` route, where the policy
is a real header covering the whole document. `astro.config.ts` hashes whatever
that file exports.

### Caching

**Server islands must stay non-personalised.** `src/middleware.ts` gives
everything under `/_server-islands/*` a public `Cache-Control` as a class,
because every island today renders public data. Add one that reads the session
and the edge will serve one reader's fragment to another. Nothing enforces
this.

**`/guestbook`'s document must not get a public `Cache-Control`.** It renders
differently for the signer, and Cloudflare's default cache key ignores cookies
— an anonymous copy at the edge would be served to signed-in readers, showing a
sign-in prompt to someone holding a valid session. Fixing that properly needs a
cookie-varying cache key, which is zone config, not code.

**Server-island props are encrypted into the `?e=` query parameter**, so they
are part of the cache key. Passing volatile data in makes the island URL change
with the data and defeats caching. `GuestbookMapIsland` fetches its own stats
for this reason.

**`scripts/verify-headers.ts` runs as part of `npm run build`** and fails it if
`dist/client/_headers` is missing or stale. Prerendered pages never reach the
middleware, so that file is their only source of security headers.

### Data

**Loaders must throw, not return `[]` or `null`.** `cached()` implements
stale-while-revalidate by catching the loader's rejection and keeping what it
holds. A loader that swallows its own error returns a value that looks like
success, gets written to KV, and replaces good data for the whole freshness
window.

**Every outbound `fetch` needs `deadline()`** from `src/lib/upstream.ts`.
`fetch` has no timeout of its own.

**`coalesce()` must delete its map entry on both settle paths.** A retained
rejected promise replays one upstream failure to every later caller for the
isolate's lifetime.

**Do not renumber `migrations/0002`.** `d1_migrations` records applied
migrations by *name*, so its body was rewritten in place to be replay-safe
while staying skipped everywhere it has already run. Renumbering would re-run
it and resurrect guestbook entries their authors deleted.

### Gotchas that cost time

**`build.format: "file"` makes `Astro.url.pathname` `/index.html`** at
prerender time for the home page, not `/`. `TopBar` normalises this; anything
else comparing pathnames must too. It differs from `astro dev`, so it is
invisible in development.

**`src/lib/cursors.ts` uses *equal* jitter, not full jitter.** Full jitter has
no lower bound and halves the expected wait before `isStalled` warns the
reader, which broke a five-second guarantee about one run in eight. A test pins
this; if it fails, do not "fix" it by loosening the assertion.

**The repo is lint-clean but not format-clean.** `npm run lint` runs
`biome lint` only. Do not run `biome format --write` across the repo — it
rewrites files wholesale and buries real changes.

**The browser preview harness reports `document.hidden === true`** even with
the tab fronted, so scroll events never dispatch. Scroll-dependent logic cannot
be verified there; extract the decision and unit-test it (see
`src/lib/edge-fade.ts`).

### Audits

`audit/<date>/` holds point-in-time reports. Every finding in `2026-09-09/` is
closed; the files describe the site as it stood at commit `6b55159` and are
kept as a record, not a to-do list.
<!-- /MAINTENANCE -->

---

## Conventions

- Comments explain **why**, not what. Prefer none to a paragraph restating the
  code. Load-bearing invariants belong in the Maintenance section above, where
  they are findable, not buried at their call site.
- Tests are `node --test`; no framework. Pure logic is extracted from
  components so it can be tested (`edge-fade`, `coalesce`, `cursors`).
- `shared/` is dependency-free TypeScript imported by both Workers and scripts.
