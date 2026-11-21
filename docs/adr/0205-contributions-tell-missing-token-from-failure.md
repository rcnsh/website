# 0205. The contributions widget tells a missing token from a failure

The GitHub contribution graph renders in a server island, so a slow GitHub response never blocks the page. The calendar is exposed only over GraphQL, which always requires a token, unlike the REST endpoints used for repos and profile, so `getContributions` in `src/lib/github.ts` returns `null` without calling GitHub when `GITHUB_TOKEN` is unset.

Every other failure throws. A GraphQL 200 response with no `contributionCalendar` is a malformed answer, not an empty one, so it throws too, and `cached()` keeps the last good copy instead of caching the absence. Because a failure never comes back as `null`, `null` can only mean the token is missing. `src/components/widgets/Contributions.astro` shows three states from this: the graph for data, a setup hint for `null`, and "Couldn't reach GitHub" for a thrown error, and each message stays accurate.

The cache serves stale data for at most 24 hours (`maxStaleSeconds: 60 * 60 * 24`). The calendar is anchored to today's date, so an older copy would render with a blank strip at its right-hand edge; past a day it is better to wait for a fresh fetch.
