# 0220. The full build runs weekly in its own workflow, not in CI

The full `npm run build` prerenders pages, which opens a remote connection for the `remote: true` R2 binding and reads `.dev.vars`. It therefore needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and the Spotify and GitHub secrets, none of which a pull request from a fork can be given. `astro build` is therefore not run in `.github/workflows/ci.yml`.

The build runs instead in `.github/workflows/build.yml`, weekly on Sunday at 06:00 UTC (`cron: "0 6 * * 0"`) and on manual dispatch. What it catches is drift: an expired token, a provider changing a response shape, the share card generator no longer producing cards. Drift does not arrive with a commit, and finding it at `npm run deploy` is too late.

The job runs only when `github.repository == 'rcnsh/website'`. Forks have none of the secrets, so a scheduled run on a fork would only ever be a red cross nobody can fix.

## Consequences

GitHub silently disables scheduled workflows after 60 days without repository activity, which is exactly when drift piles up. The workflow therefore reports to a healthchecks.io check (see ADR-0222), which alerts when no run happens.
