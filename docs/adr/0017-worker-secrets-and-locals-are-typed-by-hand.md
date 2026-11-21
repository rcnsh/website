# 0017. Worker secrets and locals are typed by hand in src/env.d.ts

`wrangler types` reads secrets from the gitignored `.dev.vars`, so on a clean checkout it generates an `Env` without them. The secrets (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_TOKEN`, `BLOG_REPO_TOKEN`, `MUSIC_WAREHOUSE_TOKEN`, `MUSIC_WAREHOUSE_CONTROL_TOKEN`) are therefore declared by hand in a `Secrets` interface in `src/env.d.ts`, kept in sync with `.dev.vars.example`.

`Secrets` extends both the global `Env` and `Cloudflare.Env`: `Cloudflare.Env` types the `env` import from `cloudflare:workers`, and the global one types Astro's `locals.runtime.env`.

The same file declares `App.Locals.owner`, which `src/lib/owner.ts` sets once the session is the owner's; the middleware stamps owner responses `private, no-store` from it.
