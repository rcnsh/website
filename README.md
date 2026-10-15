# rcn.sh

My personal site → **[rcn.sh](https://rcn.sh)**. Writing, music, files and a
guestbook, on Astro 7 and Cloudflare Workers.

<!-- TODO: add screenshot/GIF at docs/screenshot.png -->
<!-- ![rcn.sh](docs/screenshot.png) -->

Replaces [`rcnsh-astro`](https://github.com/rcnsh/rcnsh-astro), which stopped
building against current packages. How it fits together is in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## Quickstart

Node 22.12 or later.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev                      # http://localhost:4321
```

Nothing in `.dev.vars` is mandatory. Every integration falls back to an empty
state, so a blank file still gives a working site with the live parts missing.

The R2 binding is `remote: true`, so `npm run dev` reads the real bucket and
needs `npx wrangler login` first. D1 and KV are local.

`npm run generate` writes the derived files git does not carry: share cards, the
88x31 button and `public/_headers`. It already runs inside `dev`, `build` and
`preview`. Run it alone after a fresh clone if the editor wants the imports
resolved, along with `npm run cf-types` for `worker-configuration.d.ts`.

## Configuration

### Secrets

In `.dev.vars` locally, Worker secrets in production. Declared by hand in
`src/env.d.ts`; keep that, `.dev.vars.example` and this list in step.

| Name | For |
| --- | --- |
| `GITHUB_CLIENT_ID` | guestbook sign-in, the GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | same app |
| `GITHUB_TOKEN` | classic PAT with `read:user`. Contribution graph (GraphQL needs auth) and the 5000/hr REST limit |
| `MUSIC_WAREHOUSE_TOKEN` | read-only token for the music-warehouse Worker (its `READ_TOKEN`) |

```bash
npx wrangler secret put GITHUB_CLIENT_SECRET
```

### Vars

Plain `vars` in `wrangler.jsonc`.

| Name | For |
| --- | --- |
| `PUBLIC_BUCKET_URL` | the R2 bucket's custom domain. File URLs are built from it; when set, `/api/files/download` is closed |
| `MUSIC_WAREHOUSE_URL` | base URL of the music-warehouse Worker |
| `GITHUB_USERNAME` | whose repos and contributions to show. Falls back to `site.json` |
| `OWNER_GITHUB_ID` | numeric GitHub id, not the login. Gates owner-only routes (`/api/files/thumbs`) |

### Bindings

| Binding | Type | Holds |
| --- | --- | --- |
| `DB` | D1 | guestbook entries, sessions. Migrations in `migrations/` |
| `BUCKET` | R2 | the public file area |
| `CACHE` | KV | stale-while-revalidate cache: GitHub, music, the file tree, file metadata, the guestbook's first page |
| `API_BUDGET` | rate limit | everything the Worker renders, 120/min |
| `SCAN_BUDGET` | rate limit | routes that read the whole file tree, 80/min |
| `AUTH_BUDGET` | rate limit | the OAuth round trip, 10/min |

The resources already exist and their ids are committed in `wrangler.jsonc`.
On another account, create them and paste the new ids in:

```bash
npx wrangler d1 create rcnsh
npx wrangler kv namespace create CACHE
npx wrangler r2 bucket create <bucket>
npm run cf-types
```

Rate-limit `namespace_id`s are account-wide; two bindings sharing one share
counters.

### GitHub OAuth app

GitHub → Settings → Developer settings → OAuth Apps. No scopes are requested.

| | Callback URL |
| --- | --- |
| local | `http://localhost:4321/api/auth/callback` |
| production | `https://rcn.sh/api/auth/callback` |

GitHub allows one callback per app, so local and production need an app each.

### Site text

`src/content/site.json` holds the parts that are text rather than code — name,
bio, page titles, nav, links, the /uses list, pinned repos, the clock.
`src/lib/site.ts` validates it at build time, so a typo fails the build naming
the exact path:

```
Invalid src/content/site.json:
  identity.author: Invalid input
```

Prose fields take `[text](url)` links and nothing else. Icons are mapped by name
in `src/components/icons.ts`; the command palette is built from `nav` + `links`.

## Writing a post

```bash
$EDITOR src/content/blog/some-post.md   # → /blog/some-post
```

```markdown
---
title: "Post title"
description: "One sentence. Used on the index, in meta tags, and in both feeds."
pubDate: 2026-10-11
draft: true
---
```

`updatedDate` is optional. `draft: true` shows under `npm run dev` and is
dropped from the build. A missing field fails the build with the file named.
`.md` only, no MDX. The share card is drawn by `npm run generate`.

`src/content/blog/_formatting-reference.md` is a draft showing every element the
prose styles handle.

## Deploying

Deploys go through Wrangler; the project has not moved to `cf` yet.

```bash
npx wrangler login
npm run deploy                   # build, then wrangler deploy
npm run db:migrate:remote        # only when migrations/ changed
```

Migrations are not part of `deploy`; applying them is separate and deliberate.
Secrets are set once with `wrangler secret put`, above.

The build needs Cloudflare credentials and a filled-in `.dev.vars`:
prerendering reads the remote R2 bucket and the live integrations. That is why
CI (`ci.yml`) stops at lint, tests and `astro check`, and the full build runs
weekly in `build.yml`. That workflow reads these repository secrets (Settings →
Secrets and variables → Actions):

| Name | For |
| --- | --- |
| `DEV_VARS` | the contents of a filled-in `.dev.vars` |
| `CLOUDFLARE_API_TOKEN` | API token with Workers Scripts:Edit and R2:Read |
| `CLOUDFLARE_ACCOUNT_ID` | the account that token belongs to |
| `HC_BUILD_URL` | optional. healthchecks.io ping URL for the weekly run; a missed or failed build alerts. Unset skips the pings |

The site bills per request and per CPU millisecond, with no spend cap behind
either. [`docs/abuse.md`](docs/abuse.md) covers what that exposes, the CPU
ceiling and per-client budgets, the two things that have to be set in the
dashboard, and what to do if it is happening now.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | dev server in workerd, local D1/KV, remote R2 |
| `npm run build` | generate, `wrangler types`, `astro check`, build, headers check |
| `npm run generate` | the derived files git does not carry |
| `npm test` | unit tests, on the Node test runner. No framework |
| `npm run lint` / `lint:fix` | Biome. Lint only; the repo is not format-clean |
| `npm run preview` | build, then `wrangler dev` on the real bindings |
| `npm run deploy` | build and deploy the Worker |
| `npm run cf-types` | regenerate `worker-configuration.d.ts` after editing bindings |
| `npm run db:generate` | new migration from the Drizzle schema |
| `npm run db:migrate:local` / `:remote` | apply migrations |
| `npm run db:studio` | Drizzle Studio |
| `npm run world` / `marks` | redraw the map outlines and the brand marks. Rarely |

## Notes to self

[`CLAUDE.md`](CLAUDE.md) records the invariants that are expensive to
rediscover — why the CSP is shaped the way it is, which caches must stay
non-personalised, and what will quietly break if they change. Worth reading
before touching the middleware, `astro.config.ts` or `shared/security.ts`.

## Reuse

MIT, see [`LICENSE`](LICENSE). It is built around my own accounts and content,
so it is not meant to be run as-is by anyone else, but take whatever is useful.

## Issues

Something broken on the site → [open an issue](https://github.com/rcnsh/website/issues).
