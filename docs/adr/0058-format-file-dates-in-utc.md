# 0058. Format /files dates in UTC

The /files island renders on the Worker and hydrates in the reader's time zone. A date that differs between the two is a React hydration mismatch, so `formatDay` in `src/lib/files-nav.ts` builds its `Intl.DateTimeFormat` with `timeZone: 'UTC'`.

`src/lib/files-nav.test.ts` tests `formatDay` at 23:30 UTC on 4 June and expects `4 Jun 2024`. That instant is already 5 June in eastern zones, so the test proves the format is pinned to UTC rather than to the runner's zone.
