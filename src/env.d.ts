// Secret bindings, declared by hand: `wrangler types` reads them from the
// gitignored `.dev.vars`, so a clean checkout would generate an Env without
// them. Keep in sync with `.dev.vars.example`.
interface Secrets {
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	GITHUB_TOKEN: string;
	// Fine-grained, Contents: write on rcnsh/website only. The on-site post
	// editor commits with it; see src/lib/blog-repo.ts.
	BLOG_REPO_TOKEN: string;
	// Read-only credential for the music-warehouse Worker. It reaches that
	// Worker's /api/* routes and nothing else — it cannot poll or write.
	// Spotify's own credentials live in the warehouse, not here.
	MUSIC_WAREHOUSE_TOKEN: string;
	// The warehouse's CONTROL_TOKEN: starts playback and reaches nothing else.
	// Used only by the owner-gated /api/music/play.
	MUSIC_WAREHOUSE_CONTROL_TOKEN: string;
}

// Merged into both spellings: `Cloudflare.Env` backs the `env` import from
// "cloudflare:workers", while the global one backs Astro's `locals.runtime.env`.
interface Env extends Secrets {}

declare namespace Cloudflare {
	interface Env extends Secrets {}
}
