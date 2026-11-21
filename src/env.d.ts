interface Secrets {
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	GITHUB_TOKEN: string;
	BLOG_REPO_TOKEN: string;
	MUSIC_WAREHOUSE_TOKEN: string;
	MUSIC_WAREHOUSE_CONTROL_TOKEN: string;
}

interface Env extends Secrets {}

declare namespace Cloudflare {
	interface Env extends Secrets {}
}

declare namespace App {
	interface Locals {
		owner?: boolean;
	}
}
