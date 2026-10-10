# Architecture

One Astro 7 project, built into one Cloudflare Worker with static assets. The
invariants that break things when changed are in [`CLAUDE.md`](CLAUDE.md); this
is the map.

## Rendering

Static by default (`output: "static"` in `astro.config.ts`). Pages prerender at
build time and are served as assets, which never invoke the Worker. Anything
live arrives one of two ways:

- **server islands** — `<Widget server:defer>` in a prerendered page. The shell
  is static; the island renders on the Worker and is fetched from
  `/_server-islands/*`. Used for the home page tiles, the music page stats, the
  file browser's root and the guestbook map.
- **dynamic routes** — `export const prerender = false`. `/guestbook` and
  everything under `src/pages/api/`.

Client JS is React islands (`client:load` / `idle` / `visible`) in
`src/components/react/`, plus small inline scripts in `.astro` components.
There is no client router: `<ClientRouter />` breaks the CSP, see `CLAUDE.md`.

`build.format: "file"` and `trailingSlash: "never"` give `/blog/some-post`
rather than `/blog/some-post/`.

## Routing

File-based, under `src/pages/`.

| Route | Kind | |
| --- | --- | --- |
| `/` | static + islands | tiles: now playing, stats, contributions, repos, files, guestbook |
| `/blog`, `/blog/[...slug]` | static | from the `blog` content collection |
| `/rss.xml`, `/feed.json` | static | feeds |
| `/music` | static + islands | now playing, listening stats, top tracks/artists, recent |
| `/files` | static + island | file browser |
| `/guestbook` | dynamic | reads the session, takes the form post |
| `/uses` | static | from `site.json` |
| `/shell-fs.json` | static | the command palette shell's filesystem |
| `/api/auth/*` | dynamic | `login`, `callback`, `logout` |
| `/api/guestbook/*` | dynamic | `list` (pagination), `delete` |
| `/api/files/*` | dynamic | `list`, `search`, `meta`, `thumbs`, `download` |
| `/api/spotify/*` | dynamic | `now-playing`, `top` |

## Request path

`src/middleware.ts` runs on everything the Worker renders:

1. `throttle()` (`src/lib/throttle.ts`) spends from a rate-limit binding chosen
   by path — `AUTH_BUDGET`, `SCAN_BUDGET` or `API_BUDGET`. Over budget is a 429
   before the route touches D1, KV or R2. Fails open.
2. the route runs.
3. security headers from `shared/security.ts` are added, without clobbering a
   route's own CSP. Server islands get a public `Cache-Control`; anything
   rendered for a signed-in reader gets `private, no-store`.

Prerendered pages never reach the middleware. Their headers come from
`public/_headers`, written by `scripts/generate-headers.ts` from the same
`shared/security.ts` and checked by `scripts/verify-headers.ts` in the build.

## Bindings

Read through `import { env } from "cloudflare:workers"`. Configured in
`wrangler.jsonc`; secrets typed by hand in `src/env.d.ts`.

| Binding | Used by |
| --- | --- |
| `DB` (D1) | `src/lib/db/` — Drizzle client and schema. Tables `guestbook`, `sessions` |
| `BUCKET` (R2) | `src/lib/r2.ts`, `src/lib/media.ts`, `/api/files/*` |
| `CACHE` (KV) | `src/lib/cache.ts` |
| `*_BUDGET` (rate limit) | `src/lib/throttle.ts` |

## Caching

`cached(key, freshFor, loader)` in `src/lib/cache.ts` is stale-while-revalidate
over KV: a cold miss waits on the loader, anything else is served at once and
refreshed behind the response with `waitUntil`. A loader failure keeps the
stale value, so loaders must throw rather than return empty.
`src/lib/coalesce.ts` collapses concurrent loads of one key in an isolate.

On top of that: the edge caches server islands as a class (middleware), and
`/api/guestbook/list`, `/api/files/search` and `/api/spotify/now-playing` use
the Cache API. Which surface is cached where, and why, is in
[`docs/abuse.md`](docs/abuse.md).

Every outbound `fetch` carries `deadline()` from `src/lib/upstream.ts`.

## Guestbook and sign-in

GitHub OAuth, hand-rolled in `src/lib/auth.ts`. No library, no scopes.

```
/api/auth/login     → state cookie, redirect to GitHub
/api/auth/callback  → check state, exchange code, fetch /user, create session
/api/auth/logout    → POST, delete session
```

- sessions are a random 256-bit token in an `httpOnly` cookie; D1 stores only
  its SHA-256. 30 days, extended on use past halfway.
- expired rows are swept on a 1-in-50 sample of `getSession()` calls, since the
  adapter's entry has no hook for a cron trigger.
- the owner is matched on `OWNER_GITHUB_ID`, the numeric id, not the login.

Signing is a plain form post to `/guestbook` itself, then post/redirect/get.
Checks in order: signed in, non-empty, length (`site.json`), profanity
(`src/lib/profanity.ts`), one message a day. The signer's country comes from
`request.cf.country` and feeds the map. Deletes go through
`/api/guestbook/delete`, scoped to the signer's own GitHub id.

Reads are in `src/lib/guestbook.ts`: keyset pagination on
`(created_at, id)`, first page and per-country totals cached in KV.
`GuestbookList.tsx` loads further pages on scroll.

## Files

The public file area is the R2 bucket, served straight from its custom domain
(`PUBLIC_BUCKET_URL`), so downloads never reach the Worker. The site only lists
and previews; uploads happen outside it.

- `src/lib/r2.ts` walks the bucket into a packed tree cached in KV.
  `FilesRoot` inlines it when small enough, else `FileBrowser.tsx` lazy-loads
  one directory at a time from `/api/files/list`.
- `/api/files/search` searches the cached tree.
- `/api/files/meta` demuxes media metadata with Mediabunny over ranged R2 reads
  (`src/lib/media-meta.ts`), capped by a read budget and cached per key and
  upload time. The Worker never decodes; it has no WebCodecs.
- previews and thumbnails are decoded in the browser
  (`src/lib/media-preview.ts`, loaded with `import()`). The owner's browser
  can upload generated thumbs to `.thumbs/` via `/api/files/thumbs`; everyone
  else falls back to generating them locally.

## Music

Listening data comes from a separate music-warehouse Worker
(`MUSIC_WAREHOUSE_URL` + `MUSIC_WAREHOUSE_TOKEN`), which holds the only Spotify
grant. `src/lib/spotify.ts` calls it server-side only; the browser talks to
`/api/spotify/*` and never sees the token. Responses are validated with Zod
against just the fields rendered.

- top tracks/artists and recent plays go through `cached()`, fresher windows for
  shorter ranges.
- now playing is uncached upstream. `/api/spotify/now-playing` holds it in the
  Cache API for 10s per colo and advances the stored progress by the entry's
  age on a hit, so the bar does not rewind.

## Live updates

Polling, no sockets. Two things tick:

- `NowPlaying.tsx` polls `/api/spotify/now-playing` every 30s, interpolates the
  progress bar locally every second, re-polls near the end of a track, stops
  while the tab is hidden and goes stale after three failed polls.
- `ClockTile.astro` re-renders every second.

Both read the "live updates" switch in the settings menu (`src/lib/prefs.ts`,
`localStorage` key `rcn:live`) and stop when it is off.

## GitHub

`src/lib/github.ts` reads the profile, repos and the contribution calendar (GraphQL,
needs `GITHUB_TOKEN`) for `GITHUB_USERNAME`, all through `cached()`.

## Content

- `src/content/blog/*.md` — the `blog` collection, schema in
  `src/content.config.ts`. Drafts render in dev only (`src/lib/blog.ts`).
- `src/content/site.json` — every bit of site text, validated by
  `src/lib/site.ts` at build time.
- `src/lib/shell-fs.ts` builds a virtual filesystem from both, prerendered to
  `/shell-fs.json` for the command palette's shell (`src/lib/shell.ts`).

## Generated files

`npm run generate`, run before `dev`, `build` and `preview`. None are committed.

| Script | Writes |
| --- | --- |
| `scripts/generate-og.ts` | `public/og/` share cards, via Satori + sharp. Build-time because workerd has neither |
| `scripts/generate-headers.ts` | `public/_headers` |
| `scripts/generate-badge.ts` | `public/badge.png`, the 88x31 button |

`generate-world.ts` and `generate-brand-marks.ts` are run by hand and their
output is committed.

## Key files

```
astro.config.ts           adapter, CSP, Markdown, integrations
wrangler.jsonc            bindings, vars, CPU limit, rate limits
src/middleware.ts         throttle, security headers, Cache-Control
src/env.d.ts              secret types
src/lib/auth.ts           OAuth + sessions
src/lib/cache.ts          KV stale-while-revalidate
src/lib/throttle.ts       rate-limit buckets
src/lib/db/schema.ts      D1 schema (Drizzle)
src/lib/r2.ts             bucket tree
src/lib/spotify.ts        music-warehouse client
src/lib/github.ts         GitHub client
src/lib/site.ts           site.json schema
shared/security.ts        CSP and headers, used by Worker and scripts
shared/inline-scripts.ts  inline scripts whose hashes go in the CSP
migrations/               D1 migrations, from drizzle-kit
```

## Decisions

- **static first.** Prerendered requests are free; only islands and API routes
  are billed. `limits.cpu_ms` and the rate-limit budgets bound the rest.
- **no Spotify credential here.** The warehouse owns the grant, so this site
  has no refresh token to keep alive or leak.
- **hand-rolled OAuth.** One provider and no scopes, so no library.
- **share cards at build time**, not on request: sharp and fonts do not run in
  workerd.
- **two CSPs on prerendered pages**, `_headers` and Astro's hashed `<meta>`;
  what runs is their intersection. See `CLAUDE.md` before changing either.
- **server islands are cached as a class**, so none may read the session.
