# rcn.sh

Personal site — Astro 7 + React 19 islands on Cloudflare Workers.

Replaces [`rcnsh-astro`](https://github.com/rcnsh/rcnsh-astro), which stopped
building because it depended on packages that no longer exist:

| Old | Why it broke | Now |
| --- | --- | --- |
| `@astrojs/db` (Astro Studio) | Sunset by Astro; removed entirely in Astro 7 | Drizzle ORM + Cloudflare D1 |
| `@astrojs/tailwind` | Removed in Astro 6 | `@tailwindcss/vite` (Tailwind 4) |
| `million` / `@million/lint` | Abandoned; broke the Vite pipeline | Dropped — React 19 doesn't need it |
| `auth-astro` + `@auth/core@0.18` | Pinned and unmaintained | Arctic 3 + cookie sessions in D1 |
| `@aws-sdk/client-s3` for R2 | Heavy, needed access keys, capped at 1000 objects | Native R2 binding |
| `@astrojs/vercel` | — | `@astrojs/cloudflare` |

## Stack

- **Astro 7** — `output: "static"`, so every page is a prerendered shell.
  Live data arrives through [server islands](https://docs.astro.build/en/guides/server-islands/)
  (`server:defer`) or routes that opt out with `export const prerender = false`.
- **React 19 islands** — only where there's real interactivity: command
  palette, file browser, music explorer, now-playing card.
- **Tailwind 4** — tokens live in `@theme` at the top of `src/styles/global.css`.
- **Motion 13** for animation, **Drizzle** for D1, **Arctic** for OAuth.

## Local setup

```bash
npm install
```

If npm reports blocked install scripts, approve them — `workerd` and `esbuild`
download platform binaries in `postinstall` and nothing runs without them:

```bash
npm install-scripts approve workerd esbuild
```

Create the Cloudflare resources and paste the ids into `wrangler.jsonc`:

```bash
npx wrangler d1 create rcnsh
npx wrangler kv namespace create CACHE
```

Set up secrets and the database:

```bash
cp .dev.vars.example .dev.vars   # then fill it in
npm run db:migrate:local
npm run dev
```

`.dev.vars` documents every secret. Nothing is mandatory — each integration
degrades to an explanatory empty state — but:

- **`GITHUB_TOKEN`** (classic PAT, `read:user`) is required for the contribution
  graph. GitHub only exposes the calendar over GraphQL, which always needs auth.
  It also lifts the REST limit from 60 to 5000 requests/hour.
- **`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`** come from an OAuth app. An
  OAuth app has only one callback URL, so register two apps: one on
  `http://localhost:4321/api/auth/callback` whose credentials go in `.dev.vars`,
  and one on `https://rcn.sh/api/auth/callback` whose credentials go in as
  Worker secrets. No code change is needed — `getGitHubClient` builds the
  redirect from the request origin, so each deployment describes its own.
- **Spotify** needs a refresh token minted with `user-read-currently-playing`,
  `user-top-read` and `user-read-recently-played`.

## Deploying

```bash
npm run db:migrate:remote
npx wrangler secret put GITHUB_CLIENT_ID     # repeat for each secret
npm run deploy
```

`PUBLIC_BUCKET_URL` in `wrangler.jsonc` is `https://upload.rcn.sh`, the custom
domain on the `rcn` bucket. If you empty it, file links fall back to
`/api/files/download`, which streams objects through the Worker instead —
correct, but it burns Worker requests and loses CDN caching, so prefer the
public domain.

## Content

Everything you're likely to change lives in **`src/content/site.json`** — name,
tagline, bio, page titles and intros, nav, links, the "uses" list, pinned repos,
the guestbook character limit, and the home page clock. No code.

The clock shows *your* time, not the visitor's: `clock.timeZone` is pinned
(`Europe/London`) and validated against the runtime's zone database, so a typo
like `Europe/Newcastle` fails the build instead of throwing in the browser.

Vite inlines the JSON at build time, so it costs nothing at runtime — there's no
file read or parse when a page is served.

`src/lib/site.ts` only loads and validates it. The schema runs at build time, so
a typo fails the build naming the exact path rather than shipping a broken page:

```
Invalid src/content/site.json:
  identity.author: Invalid input
  stack.0.url: Invalid input
```

Prose fields (`home.bio`, each `pages.*.intro`) accept `[text](url)` links and
nothing else — rendered by `src/components/RichText.astro`, which emits
everything outside a link as plain text, so config copy can't inject markup.
External links get `target="_blank"` and `rel="noopener noreferrer"`
automatically.

Two things are deliberately *not* in the JSON:

- **Icons.** JSON can't hold a component, so `icon` is a string mapped in
  `src/components/react/icon-map.ts`. Add a name there before using it.
- **The command palette's contents.** It's built from `nav` + `links`, so adding
  a nav entry adds it to the palette too. `TopBar.astro` passes the list in as a
  prop rather than the island importing `site.ts` directly — that would pull Zod
  into the client bundle.

## Layout

```
src/
  content/        site.json — the file to edit
  lib/            config loader, utils, and one module per integration
    db/           Drizzle schema + D1 client
  components/
    react/        client islands
    widgets/      server islands (server:defer)
  layouts/        the single page shell
  pages/
    api/          on-demand endpoints (prerender = false)
migrations/       D1 migrations, generated by drizzle-kit
```

Bindings come from `cloudflare:workers`:

```ts
import { env } from "cloudflare:workers";
env.DB; // D1   env.BUCKET; // R2   env.CACHE; // KV
```

`Astro.locals.runtime.env` — the pattern the old site used — was removed in
Astro 6.

## Notes

- **Editing your details:** see [Content](#content) above — it's all one JSON
  file, no code.
- **Old guestbook entries** aren't migrated. The new `guestbook` table is keyed
  on GitHub user id rather than email, since GitHub emails are often private.
  If you still have an export of the old `Guests` rows, they can be backfilled —
  you'd need to map each email to a GitHub id.
- **Profanity filtering** is a local wordlist (`src/lib/profanity.ts`) instead of
  the old call to `vector.profanity.dev`, so signing doesn't depend on a
  third-party service being up.
- **The games tab is gone**, as intended. The Steam and Valorant code from the
  old repo wasn't carried over; Valorant survives as an external link.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server in workerd, with local D1/R2/KV |
| `npm run build` | `astro check` then a production build |
| `npm run preview` | Build, then serve with wrangler |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run cf-types` | Regenerate `worker-configuration.d.ts` after editing bindings |
| `npm run db:generate` | New migration from the Drizzle schema |
| `npm run db:migrate:local` / `:remote` | Apply migrations |
