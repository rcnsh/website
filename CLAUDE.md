# rcn.sh

Personal site. Astro 7 (static by default, server islands for live data) on
Cloudflare Workers, with D1, R2 and KV.

```
npm run dev        # astro dev, port 4321
npm run build      # generate → wrangler types → astro check → astro build → verify:headers
npm test           # node --test over src/, shared/
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

**Astro's meta carries `script-src` and `style-src` only.** Everything else
(`connect-src`, `media-src`, `img-src`) binds from the header alone, which is
why the bucket origin needs to be in `BUCKET_ORIGIN` (`shared/security.ts`) and
nowhere else. Pass Astro any `directives` and that stops being true: those
hosts must then be in both policies. `worker-src` is the trap: it falls back to
`script-src`, which the meta *does* bind.

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

**Every music-warehouse call goes through `warehouse` (`src/lib/warehouse.ts`).**
`read()` throws on a failed response or a schema mismatch, applies
`deadline()`, and namespaces cache keys under `warehouse:`. A read's cached
value is its schema's *output*, transforms included, so changing what a
schema transforms to means bumping its key (`recent:v3`), or stale entries
in the old shape reach new code. The read definitions live in
`src/lib/spotify-reads.ts`, free of `cloudflare:workers`, so tests drive them
through `createWarehouse` with a fake `fetch`. `getNowPlaying()` throws on a
bad shape too; the now-playing route alone turns that into "not playing".

**Do not renumber `migrations/0002`.** `d1_migrations` records applied
migrations by *name*, so its body was rewritten in place to be replay-safe
while staying skipped everywhere it has already run. Renumbering would re-run
it and resurrect guestbook entries their authors deleted.

### File previews

**Mediabunny never decodes on the Worker.** Workers have no WebCodecs.
`src/lib/media-meta.ts` demuxes only (no sinks, no `Conversion`), through a
`CustomSource` of ranged R2 reads capped by `READ_BUDGET`. Decoding lives in
`src/lib/media-preview.ts`, which `src/components/files/client.ts` loads with `import()` so
Mediabunny stays out of the page bundle. Import from it, never from `mediabunny`
directly in a component, or the chunk boundary goes.

**No `blob:` grant, and adding one would not be enough.** The read paths spawn
no Workers. Mediabunny does spawn `blob:` Workers for `CanvasSink`'s
`alpha: true` and for anything that encodes (`Output`, `Conversion`). That
needs `worker-src blob:` in *both* policies (see the CSP note above).
In-memory previews are `data:` URLs for the same reason.

**A thumb belongs to one upload of its source.** `/api/files/thumbs` stamps
every `.thumbs/<key>.<kind>` with the source's upload time (`source-uploaded`
custom metadata). Only thumbs whose stamp matches the object's current upload
time count, so a re-upload under the same key falls back to in-browser
generation instead of showing the old file's frames. Targets are derived
server-side from the source key; the client never names a path.

**Metadata is cached per key and upload time, and never expires in practice.**
Over-budget files are cached as `{ supported: false }` because that is a
property of the file. Every other failure must rethrow, per "loaders must
throw". Thumbs presence is cached separately for an hour, and the upload route
deletes that entry.

### File visibility

**Each folder is `listed`, `unlisted` or `private`** (`file_visibility` in D1,
logic in `shared/visibility.ts`). A folder without a row inherits from its
nearest ancestor; the root's row is the default, `unlisted`, so a new upload
folder is never shown until chosen. The owner sets them from the /files
browser.

**upload.rcn.sh is a Worker (`workers/upload`), not R2 public access.** It is
the only thing standing between a private key and the internet. Re-enabling
the bucket's public domain or r2.dev URL bypasses every private folder at once.
It refuses private keys, `.thumbs/` of private sources, and every other dot
path. Deploy it with `npm run deploy:upload`; `npm run deploy` does not.

**Private files download through `/api/files/download`, owner only.** That
route still 404s public keys while `PUBLIC_BUCKET_URL` is set. The browser
picks the route per file (`baseFor` in FileBrowser), so a private file has no
stored thumbs and previews are generated in the browser.

**Islands and the home tile render the visitor view only.** They are cached
publicly (see Caching), so the owner's full tree comes from
`/api/files/visibility` after hydration. Anything new that reads `cachedTree()`
for a public response must go through `visitorTree()` instead.

**Rules fail closed.** `loadRules()` throws rather than returning `{}`, and an
unknown stored value reads as `private`. Both Workers trust their copy for 10s,
so a change lands everywhere within that. The search edge cache is keyed on
`rulesVersion()`, so it does not lag. The FilesRoot island can show a
just-hidden folder's names until its edge copy expires (`s-maxage=300`), but
private bytes are refused at once.

### Blog editor

**`/blog/edit` commits to `main`; it does not write to the site.** Saves go
through the GitHub Contents API (`src/lib/blog-repo.ts`) with the
`BLOG_REPO_TOKEN` secret, a fine-grained PAT that should hold Contents: write on
this repo and nothing else. The owner check (`isOwner`) is the only thing
gating who can use it, so it must stay on both the page and
`/api/blog/post`. Posts go live through Workers Builds, which deploys every
push to `main`, so a saved post ships whatever else is on `main` with it.

**The frontmatter schema lives in `src/lib/post-source.ts`**, shared by
`content.config.ts` and the editor, so the editor refuses what the build
would. A field added to one place only means a commit that breaks the deploy.
`post-slug.ts` stays dependency-free because the editor bundles it.

**Edit links on prerendered pages come from a `localStorage` flag**
(`src/lib/owner-hint.ts`) that `/blog/edit` sets for the owner. That way
visitors don't each pay for a Worker call. It is a hint, not a permission:
the links lead to pages that check the session.

**Sign-in's `?next=` goes through `returnPath()`** on the way in and again on
the way out, since the cookie comes back from the browser. Loosening it turns
`/api/auth/login` into an open redirect.

### Owner playback

**Track links stay links for everyone; the owner also gets a play button.**
`PlayButton` (`.astro`, and `.tsx` for React lists) is rendered for every visitor,
because pages and islands are cached publicly, and hidden by `.play-track` in
`global.css`. `PlayOnSpotify` (in `Layout`) sets `data-owner` on `<html>` when
the owner cookie is present, which reveals them, and posts their clicks to
`/api/music/play`. That route checks `isOwner` and calls `warehouse.play()`,
which sends `MUSIC_WAREHOUSE_CONTROL_TOKEN` to the warehouse's
`/control/play`, a token that can start playback and nothing else; never use
it for reads, and never give the read token control. Both tokens are read only
in `src/lib/warehouse-client.ts`, where `read` sends the read token and `play`
the control token, so keep any new warehouse call inside that client. The
button sits beside the title, never inside a link: rows use a stretched link
(`after:absolute after:inset-0`) so the button can be a sibling.

### Gotchas that cost time

**`build.format: "file"` makes `Astro.url.pathname` `/index.html`** at
prerender time for the home page, not `/`. `TopBar` normalises this; anything
else comparing pathnames must too. It differs from `astro dev`, so it is
invisible in development.

**`text-base` is a colour here, not a size.** The theme's `--color-base`
token wins the name, so `text-base` paints text the page background — near
invisible, and only noticed when no other `text-*` colour happens to override
it. Write the size explicitly (`text-[16px]`).

**The repo is lint-clean but not format-clean.** `npm run lint` runs
`biome lint` only. Do not run `biome format --write` across the repo — it
rewrites files wholesale and buries real changes.

**The browser preview harness reports `document.hidden === true`** even with
the tab fronted, so scroll events never dispatch. Scroll-dependent logic cannot
be verified there; extract the decision and unit-test it (see
`src/lib/edge-fade.ts`).
<!-- /MAINTENANCE -->

---

## Conventions

- Comments explain **why**, not what. Prefer none to a paragraph restating the
  code. Load-bearing invariants belong in the Maintenance section above, where
  they are findable, not buried at their call site.
- Tests are `node --test`; no framework. Pure logic is extracted from
  components so it can be tested (`edge-fade`, `coalesce`).
- `shared/` is dependency-free TypeScript imported by the Worker and scripts.
