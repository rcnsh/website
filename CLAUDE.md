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

**Every prerendered page carries the same `<meta>` CSP.** `<ClientRouter />`
keeps one document and swaps pages into it, and a meta CSP binds the document
it was parsed with, so the entry page's policy must already allow every
page's inline scripts. Astro writes per-page hashes; the `csp-union`
integration (`astro.config.ts`, `scripts/csp-union.ts`) rewrites every page's
meta to the union of them all on `astro:build:done`, and fails the build if any
page holds an inline `<script>` or `<style>` that union does not hash. It is a
build hook rather than an npm script so Workers Builds runs it whatever command
it uses. The union stays in the meta, not `_headers`: it is already ~1,900
characters of hashes, and a `_headers` line stops at 2,000. Without it, every
soft navigation after the first blocks the new page's islands — invisible on a
direct load, which is what made it expensive to diagnose.

**The router is on prerendered pages only** (`Astro.isPrerendered` in
`Layout`). An SSR page's policy is Astro's per-response header naming only its
own scripts, and its server-island placeholders carry props encrypted per
request, so no build-time union can cover them. The router full-loads into any
page without `<ClientRouter />`, but only after fetching and discarding it, so
`SERVER_PAGES` (`src/lib/server-pages.ts`, pinned to `src/pages` by its test)
sends links into them, and into `/api/`, straight to a full load. Links out of
one are ordinary loads. Never
give a `prerender = false` page the router: soft navigation from it would run
every other page's scripts under its policy.

**Scripts run once per document, not once per page.** Anything bound to a
page's markup goes through `onPage` (`src/lib/page-lifecycle.ts`): it runs at
once, again after every swap, and aborts its signal when the page leaves, so
window and document listeners, observers and timers must take that signal. A
page's own setup keeps firing on every later page once loaded, so it must bail
when its markup is absent. Not `astro:page-load`: the router fires the first one
on window `load`, after every image. Module state outlives the page too
(`forgetOwnerView` exists for that), and a page back from the back-forward
cache never re-runs it, so `/files` reloads there if the owner hint changed
meanwhile (signing out on `/guestbook`, then Back). Navigate from code with `navigate()` from
`astro:transitions/client`, never `location.href`, or the player stops.

**The router replaces `<html>`'s attributes on every swap** with the incoming
page's, which were rendered without the reader's. `keepReaderAttributes`
(`page-lifecycle.ts`) carries `data-motion` and `data-owner` across; a new
attribute about the reader goes in its list. Page-level ones (`data-stats-year`,
the owner hold) are meant to drop. TopBar republishes `--header-h` per page.

**No `transition:animate`.** It emits an inline `<style>` Astro does not hash,
which the build refuses. The browser's crossfade is off in `global.css`.

**One CSP violation per navigation to a page with server islands is expected.**
The router waits for inline module scripts by appending a `data:` script, which
`script-src` refuses; the refusal fires `error`, which is all it waits for.
Adding `data:` to `script-src` to quiet it would be a real hole. Astro's script
inlining is off (`vite.build.assetsInlineLimit`) so page scripts are files and
never depend on that wait.

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
Astro never hashes an `is:inline` script; that is what `is:inline` means.
`astro.config.ts` hashes whatever that file exports. An unregistered one fails
the build on a prerendered page (`csp-union` checks) and is blocked on any
`prerender = false` route, where the policy is a real header.

### Caching

**Server islands must stay non-personalised.** `src/middleware.ts` gives
everything under `/_server-islands/*` the public `serverIslands` policy as a
class, because every island today renders public data. Add one that reads the session
and the edge will serve one reader's fragment to another. Nothing enforces
this.

**`/guestbook`'s document must not get a public `Cache-Control`.** It renders
differently for the signer, and Cloudflare's default cache key ignores cookies
— an anonymous copy at the edge would be served to signed-in readers, showing a
sign-in prompt to someone holding a valid session. Fixing that properly needs a
cookie-varying cache key, which is zone config, not code.

**Every `Cache-Control` is a named policy; never type one in a route.** The
builders (`publicFor`, `noStore`, `uncachedError`, `privateNoStore`,
`serverIslands`, `staticAssets`) are in `shared/cache-policy.ts`, so the
`_headers` generator can use them. Each public route's policy is in the
`policies` table in `src/lib/http.ts`, which `http.test.ts` pins string by
string. Where a route sits in front of a KV window its max-age is derived
from the loader's constant (`FRESH_SECONDS` in `guestbook-cache.ts`,
`CACHE_SECONDS` in `now-playing.ts`), so the two layers cannot drift.
`/api/spotify/top` is the exception: its KV windows run to 24h and `cached()`
serves stale past them, so the browser gets a 15-minute ceiling instead.

**Edge copies go through `src/lib/edge-cache.ts`** (`edgeCached`,
`invalidateEdge`; bound to the Worker in `edge.ts`). Cloudflare does not
CDN-cache a Worker's responses on `cache-control` alone, so the routes that
need it (files search, guestbook list, now-playing) keep one copy per colo in
the Cache API. It rebuilds a hit, because a cached Response's headers are
immutable and the middleware writes to them, and never stores a rejection or
a non-2xx. Keep cache names and key URLs stable: changing either orphans every
copy until it expires. The Cache API is per colo, so `invalidateEdge` clears
only the colo the write ran in; elsewhere a copy lives out its max-age.

**A guestbook write drops both layers.** `invalidate(origin, removed?)` in
`src/lib/guestbook.ts` clears page 1 and the totals in KV, and this colo's
edge copy of page 1 and of the deep page a deleted entry sat on (found with
one count in D1). Later pages need nothing: their cursors move with the rows,
so their keys change. A copy keyed by a cursor from before an earlier write is
missed, and other colos aren't reached at all, so a deleted entry can still
show for up to `FRESH_SECONDS`.

**Server-island props are encrypted into the `?e=` query parameter**, so they
are part of the cache key. Passing volatile data in makes the island URL change
with the data and defeats caching. `GuestbookMapIsland` fetches its own stats
for this reason.

**Now-playing freshness lives in `src/lib/now-playing-state.ts`.** The colo
cache, its age stamp, the progress advance, the fallback chain (live, then
last played, then stored) and the post-play invalidation are all there, bound
to the Worker by `now-playing-server.ts`. The payload type and every timing
the client depends on are in `now-playing.ts`, which `NowPlaying.tsx` imports,
so it must stay free of runtime imports. `PLAY_SETTLE_MS` mirrors the
music-warehouse's own constant of that name; change both together. The tests
assert the client's timings against it and against the cache window.

**`scripts/verify-headers.ts` runs as part of `npm run build`** and fails it if
`dist/client/_headers` is missing or stale. Prerendered pages never reach the
middleware, so that file is their only source of security headers.

### Data

**Loaders must throw, not return `[]` or `null`.** `cached()` implements
stale-while-revalidate by catching the loader's rejection and keeping what it
holds. A loader that swallows its own error returns a value that looks like
success, gets written to KV, and replaces good data for the whole freshness
window.

**`cached()` and `invalidate()` are the only way into the CACHE namespace.**
`src/lib/cache.ts` binds them to KV; the logic is `createCache` in
`src/lib/swr.ts`, which takes the store, clock and `waitUntil` so its tests run
under `node --test`. Drop an entry with `invalidate(key)` rather than
`env.CACHE.delete`, so each key format lives only beside the loader that writes
it.

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
bad shape too; `src/lib/now-playing-state.ts` alone turns that into "not
playing".

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

**Who may read a key is decided once, by `decideRead` (`shared/visibility.ts`).**
upload.rcn.sh, `/api/files/download` and `/api/files/meta` all call it, so
they refuse the same keys in the same order: no object named (400), a dot path
(404), unreadable rules (503), then a private file for anyone but the owner
(404, as missing, so existence is never confirmed). A thumb answers to its
source. The site reaches it as `canRead` on a bucket view; a new route that
serves bucket bytes must too. Key and prefix shapes (`objectKey`,
`folderPrefix`, the hidden-segment rule, `THUMBS_PREFIX`) live in
`shared/bucket-keys.ts` and nowhere else.

**Private files download through `/api/files/download`, owner only.** That
route still 404s public keys while `PUBLIC_BUCKET_URL` is set; that rule is the
route's own, not access policy. The browser picks the route per file
(`baseFor` in `src/lib/files-source.ts`), so a private file has no stored thumbs and
previews are generated in the browser.

**The site reads the bucket only through `bucket.view(reader)`**
(`src/lib/bucket.ts`): `tree()`, `listing(prefix)`, `search(q)`, `canRead(key)`,
each filtered to what that reader may see. The unfiltered tree is private to
`src/lib/bucket-view.ts` and comes out only for `view(true)`. A reader can be a
function, asked only when a decision needs it, so a public download costs no
session lookup. The logic lives in `bucket-view.ts` with the R2 listing, tree
cache and rules injected, so it tests under node.

**Islands and the home tile render the visitor view only.** They are cached
publicly (see Caching), so the owner's full tree comes from
`/api/files/visibility` after hydration. They use `view(false)`, or
`publicSummary()` where the usage bar needs hidden totals: sizes, never names.
Never pass `view(true)` or an owner check into anything served publicly.

**The browser's listings come from `src/lib/files-source.ts`**, never from a
fetch in FileBrowser. It holds the whole-tree and per-folder modes, the owner
upgrade (one `/api/files/visibility` probe, which swaps in the owner's
listings and rules) and the per-file download route, with `fetch` injected so
it tests under node. It reports the probe settled exactly once, on every path,
and `src/components/files/owner-view.ts` is the only thing that lifts the
owner hold: at once unless the owner's tree went out, then as soon as nothing
on the page shows the visitors' view, with the 5s timer as the floor. Lifting
it while an island still shows that view flashes it at the owner.
`holdOwnerViewOnFiles`, registered by `Layout` in every document, starts the
hold, since it must run before hydration: on the first soft navigation into
/files the page's own script would load after the islands.

**Rules fail closed.** `rulesLoader` (`shared/visibility.ts`) throws rather
than returning `{}`, and an unknown stored value reads as `private`. Both
Workers build their loader from it (drizzle in the site, raw D1 in
upload.rcn.sh), so both trust their copy for `RULES_FRESH_MS` (10s) and a
change lands everywhere within that. The search edge cache is keyed on
`rulesVersion()`, so it does not lag. The FilesRoot island can show a
just-hidden folder's names until its edge copy expires (`s-maxage=300`), but
private bytes are refused at once.

### Owner

**Every owner check goes through `src/lib/owner.ts`.** `requireOwner(context,
{ refuse, sameOrigin })` returns the refusal, or null for the owner;
`identify(context)` answers without refusing, for routes that serve both.
Never check `isOwner` in a route. The guestbook's signer session is not an owner check, so `guestbook.astro` and `api/guestbook/delete.ts` call `getSession` directly. The refusal styles keep
existence private: `not-found`/`not-found-json` match the route's own 404, so
download and meta never confirm a private key exists. Writes pass
`sameOrigin: true` (see `src/lib/csrf.ts`). The decisions live in
`owner-guard.ts` with the session lookup injected, so they test under node.

**An owner response is `private, no-store` whatever the route sets.** The
guard marks `locals.owner` and the middleware stamps the header from it.

**The owner hint cookie lives and dies with the session cookie.**
`writeSessionCookie` (`src/lib/session-cookie.ts`) is the session cookie's
only writer and sets or clears the hint with the same expiry, so a session
extended in `getSession` extends the hint too. `getSession` also restores a
missing hint for the owner, and any refusal deletes a stale one. Scripts read
it through `hasOwnerHint()` (`src/lib/owner-hint.ts`), which holds the one
name: `PlayOnSpotify`, the /files hold (`owner-view.ts`) and the blog edit
links. It is a hint, not a permission: nothing is granted on it.

### Blog editor

**`/blog/edit` commits to `main`; it does not write to the site.** Saves go
through the GitHub Contents API (`src/lib/blog-repo.ts`) with the
`BLOG_REPO_TOKEN` secret, a fine-grained PAT that should hold Contents: write on
this repo and nothing else. The owner guard is the only thing gating who can
use it, so it must stay on both the page and `/api/blog/post`. Posts go live through Workers Builds, which deploys every
push to `main`, so a saved post ships whatever else is on `main` with it.

**The frontmatter schema lives in `src/lib/post-source.ts`**, shared by
`content.config.ts` and the editor, so the editor refuses what the build
would. A field added to one place only means a commit that breaks the deploy.
`post-slug.ts` stays dependency-free because the editor bundles it.

**Edit links on prerendered pages come from the owner hint cookie** (see
Owner), so visitors don't each pay for a Worker call. The links lead to pages
that check the session.

**Sign-in's `?next=` goes through `returnPath()`** on the way in and again on
the way out, since the cookie comes back from the browser. Loosening it turns
`/api/auth/login` into an open redirect.

**The preview is sanitised (`renderSafePreview`).** Posts may carry raw HTML,
and the preview renders it inside the owner's session, where markup pasted
from elsewhere could act as the owner. CSP on `/blog/edit` already refuses
inline handlers; DOMPurify is the second layer. Never render
`renderPreview`'s output directly. The preview also sits outside the editor's
`<form>` (the fields join it by `form=` id): HTML parsed inside a form joins
it, so a pasted `<button>` would save, and commit, when clicked.

### Site-wide player

**One media element for the session, owned by `src/lib/player.ts`.** Created
there and never rendered, so nothing that re-renders can drop it. It lives in
the floating box (`src/components/player/MiniPlayer.astro`, in `Layout` with
`transition:persist`), or docked in the /files preview of the same file while
that is open (`useDock` in `MediaPreview.tsx`). Previews own no `<video>` or
`<audio>`: they call `play`, `toggle` and `dock`, and read `usePlayer()`.

**The box holds the element in a shadow root.** After every swap the router
replaces each `<video>` and `<audio>` it can find in the new body with a fresh,
paused copy (`reifyMediaElements`), persisted elements included.
`querySelectorAll` does not reach into a shadow root. The element's styles are
inline because the box's stylesheet does not either.

**A media element out of the document at the next stable state is paused.**
So docking is a ref callback (`useDock`): React removes a host and runs the
ref's cleanup in one synchronous commit, where a passive effect would run too
late.
A swap removes the old body before islands unmount, so the player takes the
element back into the box on `astro:before-swap`.

**A full load (an SSR page, a reload) resumes from `sessionStorage`.**
`rcn:player` is written on `pagehide` and read through `parseSavedPlayback`
(`player-state.ts`), which drops any media URL not from the site or
`BUCKET_ORIGIN`. A private file (the `/api/files/download` route) is dropped
too once the owner hint is gone, so signing out does not leave its name in the
box. Resuming with sound may be refused without a fresh click; it then waits
paused at the same spot.

### Owner playback

**Track links stay links for everyone; the owner also gets a play button.**
`PlayButton` (`.astro`, and `.tsx` for React lists) is rendered for every visitor,
because pages and islands are cached publicly, and hidden by `.play-track` in
`global.css`. `PlayOnSpotify` (in `Layout`) sets `data-owner` on `<html>` when
the owner hint cookie is present, which reveals them, and posts their clicks to
`/api/music/play`. That route runs the owner guard and calls `warehouse.play()`,
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
