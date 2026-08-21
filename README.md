# rcn.sh

Personal site. Astro 7 + React 19 islands on Cloudflare Workers.

Replaces [`rcnsh-astro`](https://github.com/rcnsh/rcnsh-astro), which stopped
building against current packages.

## Stack

- **Astro 7** — pages are prerendered; live data arrives through server islands
  (`server:defer`) or routes with `export const prerender = false`
- **React 19** — command palette, file browser, music explorer, now-playing card
- **Tailwind 4** — tokens live in `@theme` at the top of `src/styles/global.css`
- **Drizzle + D1** for the guestbook and sessions, **R2** for files, **KV** for
  caching, and a hand-rolled GitHub OAuth flow in `src/lib/auth.ts`

## Setup

```bash
npm install
```

npm holds back install scripts it hasn't been told to trust, and `workerd` and
`esbuild` download their binaries in one. The approvals are already committed
in the `allowScripts` field of `package.json`, so this should be quiet — but if
npm reports anything pending, review and approve it:

```bash
npm approve-scripts --allow-scripts-pending
```

Create the Cloudflare resources and paste the ids into `wrangler.jsonc`:

```bash
npx wrangler d1 create rcnsh
npx wrangler kv namespace create CACHE
```

Then:

```bash
cp .dev.vars.example .dev.vars   # fill it in
npm run db:migrate:local
npm run dev
```

### Secrets

Nothing is mandatory — each integration falls back to an empty state.

- **`GITHUB_TOKEN`** — classic PAT with `read:user`. Needed for the contribution
  graph, which GitHub only exposes over GraphQL.
- **`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`** — an OAuth app has only one
  callback URL, so register two: `http://localhost:4321/api/auth/callback` for
  `.dev.vars`, and `https://rcn.sh/api/auth/callback` for the Worker secrets.
  The redirect is built from the request origin, so no code changes.
- **Spotify** — a refresh token with `user-read-currently-playing`,
  `user-top-read`, and `user-read-recently-played`.

## Deploying

```bash
npm run db:migrate:remote
npx wrangler secret put GITHUB_CLIENT_ID   # repeat per secret
npm run deploy
```

`PUBLIC_BUCKET_URL` is the custom domain on the `rcn` bucket. Empty it and file
links fall back to `/api/files/download`, which streams through the Worker —
correct, but slower and uncached.

## Content

Everything you're likely to change lives in **`src/content/site.json`** — name,
bio, page titles, nav, links, the "uses" list, pinned repos, the clock. No code.

`src/lib/site.ts` validates it at build time, so a typo fails the build naming
the exact path:

```
Invalid src/content/site.json:
  identity.author: Invalid input
```

`organization` and `agent` are published verbatim — in the JSON-LD on every
page, in `/llms.txt`, and as the MCP server's `instructions`. Keep both true,
and keep `organization` no more specific than what the site already says in
prose; there is a note beside each in the file.

Prose fields accept `[text](url)` links and nothing else. Two things aren't in
the JSON: icons (mapped by name in `src/components/react/icon-map.ts`, since
JSON can't hold a component) and the command palette's contents (built from
`nav` + `links`).

## For agents

The site is built to be read by software as well as by people, and all of it is
public, read-only and unauthenticated.

| Where | What |
| --- | --- |
| `Accept: text/markdown` on any page | The prose without the chrome. `Vary: Accept` is set; a request that accepts neither HTML nor Markdown gets a 406 listing both. Follows [acceptmarkdown.com](https://acceptmarkdown.com). |
| `/llms.txt` | The [llmstxt.org](https://llmstxt.org) site map, including a *when to use this* section. |
| `/llms-full.txt` | Every page and post inlined, for one-fetch ingestion. |
| `/.well-known/agent-instructions.md` | The same guidance without the map. |
| `/mcp` | An [MCP](https://modelcontextprotocol.io) server over Streamable HTTP: 8 read-only tools, 12 resources. |
| `/.well-known/mcp.json` | The MCP descriptor, for clients that probe before connecting. |
| `/docs` | The same thing written for a human, with example requests. |

One rule keeps it honest: **`src/lib/agent-docs.ts` is the only list of what
exists.** `/llms.txt`, `/docs`, the MCP resource list, `robots.txt` and the 404
page are all projections of it, so a route cannot be advertised in one place and
missing from another — `src/lib/routes.test.ts` resolves every catalogued path
back to the file that serves it and fails if one doesn't.

Pages that negotiate Markdown carry `export const prerender = false`, because a
prerendered route on Cloudflare is served by the asset store and the Worker —
and so `src/middleware.ts` — never runs. `routes.test.ts` enforces that too.

Two things this repo cannot fix live in the Cloudflare dashboard: the AI-crawler
block and the managed `robots.txt`. See
[docs/cloudflare-agent-access.md](docs/cloudflare-agent-access.md).

## Layout

```
src/
  content/    site.json — the file to edit
    pages/    about / contact / privacy / docs bodies, as Markdown
  lib/        config, utils, one module per integration
    db/       Drizzle schema + D1 client
    mcp/      the MCP server: protocol dispatch, tools, resources
  components/
    react/    client islands
    widgets/  server islands
  layouts/    the page shell
  pages/
    api/      endpoints (prerender = false)
    .well-known/  agent + MCP discovery files
migrations/   D1 migrations, generated by drizzle-kit
```

Bindings come from `cloudflare:workers`:

```ts
import { env } from "cloudflare:workers";
env.DB; // D1   env.BUCKET; // R2   env.CACHE; // KV
```

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server in workerd, with local D1/R2/KV |
| `npm run build` | `astro check`, then a production build |
| `npm test` | Unit tests, via the Node test runner — no framework to install |
| `npm run lint` / `lint:fix` | Biome across the codebase |
| `npm run preview` | Build, then serve with wrangler |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run cf-types` | Regenerate `worker-configuration.d.ts` after editing bindings |
| `npm run db:generate` | New migration from the Drizzle schema |
| `npm run db:migrate:local` / `:remote` | Apply migrations |
