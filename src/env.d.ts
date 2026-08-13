// Secret bindings, declared by hand.
//
// `wrangler types` infers the Env interface from wrangler.jsonc plus whatever
// it finds in `.dev.vars` — and `.dev.vars` is gitignored, so a clean checkout
// (Workers Builds, a fresh clone) generates an Env with no secrets on it and
// `astro check` fails. Declaring them here keeps the types correct everywhere.
//
// Keep this list in sync with `.dev.vars.example`.
interface Secrets {
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	GITHUB_TOKEN: string;
	SPOTIFY_CLIENT_ID: string;
	SPOTIFY_CLIENT_SECRET: string;
	SPOTIFY_REFRESH_TOKEN: string;
}

// Merged into both spellings: `Cloudflare.Env` backs the `env` import from
// "cloudflare:workers", while the global one backs Astro's `locals.runtime.env`.
interface Env extends Secrets {}

declare namespace Cloudflare {
	interface Env extends Secrets {}
}
