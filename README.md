# rcn.sh

My personal site: **[rcn.sh](https://rcn.sh)**. Writing, music, files and a
guestbook, on Astro 7 and Cloudflare Workers.

Replaces [`rcnsh-astro`](https://github.com/rcnsh/rcnsh-astro), which stopped
building against current packages.

## How it's built

Static by default. Pages prerender at build time; anything live arrives through
a server island (`server:defer`) or a route that opts out with
`export const prerender = false`.

- **Astro 7** — the site
- **React 19** — command palette, file browser, music explorer, now-playing card
- **Tailwind 4** — tokens live in `@theme` at the top of `src/styles/global.css`
- **D1 + Drizzle** for the guestbook and sessions, **R2** for files, **KV** for
  stale-while-revalidate caching
- **GitHub OAuth**, hand-rolled in `src/lib/auth.ts`

A second Worker under `workers/multiplayer/` serves cursor presence over Durable
Objects. It deploys separately and agrees with the client on its rates through
`shared/multiplayer.ts`.

Listening data comes from a separate music-warehouse Worker rather than from
Spotify, so this site holds no Spotify credential of its own.

The command palette has a shell in it. `$` at the prompt gets a small POSIX-ish
one over a read-only view of the site.

## Running it

```bash
npm install
cp .dev.vars.example .dev.vars   # that file says what each one is for
npm run db:migrate:local
npm run dev
```

The Cloudflare resources already exist and their ids are committed in
`wrangler.jsonc`. Nothing in `.dev.vars` is mandatory — every integration falls
back to an empty state, so a blank file still gives a working site with the live
parts missing.

`npm run generate` writes the derived files git does not carry: share cards, the
cursor room list, the 88x31 button and `public/_headers`. It already runs inside
`dev`, `build` and `preview` — run it alone after a fresh clone if the editor
wants the imports resolved.

## Deploying

```bash
npm run deploy
```

Builds, deploys the site Worker, then the multiplayer one. Migrations are not
part of it; `npm run db:migrate:remote` is separate and deliberate.

The site bills per request, per CPU millisecond and per Durable Object second,
with no spend cap behind any of them. [`docs/abuse.md`](docs/abuse.md) covers
what that exposes, the CPU ceilings and per-client budgets in the two
`wrangler.jsonc` files, the two things that have to be set in the dashboard
because code cannot express them, and what to do if it is happening now.

## Layout

```
src/
  content/    site.json, and the blog posts
  lib/        config, utils, one module per integration
    db/       Drizzle schema + D1 client
  components/
    react/    client islands
    widgets/  server islands
  layouts/    the page shell
  pages/
    api/      endpoints (prerender = false)
shared/       dependency-free TS, imported by both Workers and the scripts
workers/
  multiplayer/  cursor presence, over Durable Objects
scripts/      the generators behind `npm run generate`
migrations/   D1 migrations, from drizzle-kit
```

Bindings come from `cloudflare:workers`:

```ts
import { env } from "cloudflare:workers";
env.DB; // D1   env.BUCKET; // R2   env.CACHE; // KV
```

`src/content/site.json` holds the parts that are text rather than code — name,
bio, page titles, nav, links, the /uses list, pinned repos, the clock.
`src/lib/site.ts` validates it at build time, so a typo fails the build naming
the exact path:

```
Invalid src/content/site.json:
  identity.author: Invalid input
```

Prose fields take `[text](url)` links and nothing else. Two things are not in
the JSON: icons, mapped by name in `src/components/icons.ts` because JSON cannot
hold a component, and the command palette's contents, built from `nav` + `links`.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server in workerd, with local D1/R2/KV |
| `npm run dev:multiplayer` | The cursor Worker, on :8788 |
| `npm run build` | `astro check`, a production build, then a headers check |
| `npm run generate` | The derived files git does not carry |
| `npm test` | Unit tests, on the Node test runner — no framework |
| `npm run lint` / `lint:fix` | Biome. Lint only; the repo is not format-clean |
| `npm run preview` | Build, then serve on the real bindings |
| `npm run deploy` | Build and deploy both Workers |
| `npm run cf-types` | Regenerate `worker-configuration.d.ts` after editing bindings |
| `npm run db:generate` | New migration from the Drizzle schema |
| `npm run db:migrate:local` / `:remote` | Apply migrations |
| `npm run db:studio` | Drizzle Studio against D1 |
| `npm run world` / `marks` | Redraw the map outlines and the brand marks. Rarely |

## Notes to self

[`CLAUDE.md`](CLAUDE.md) records the invariants that are expensive to
rediscover — why the CSP is shaped the way it is, which caches must stay
non-personalised, and what will quietly break if they change. Worth reading
before touching the middleware, `astro.config.ts` or `shared/security.ts`.

`audit/` holds point-in-time reports. Every finding in them is closed; they are
kept as a record, not a to-do list.

---

MIT. It is built around my own accounts and content, so it is not meant to be
run as-is by anyone else, but take whatever is useful.
