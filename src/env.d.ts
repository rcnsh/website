// Secret bindings, declared by hand: `wrangler types` reads them from the
// gitignored `.dev.vars`, so a clean checkout would generate an Env without
// them. Keep in sync with `.dev.vars.example`.
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
