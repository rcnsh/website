# Reliability & error-handling audit

**Status: all 16 findings resolved** (2 × P1, 8 × P2, 6 × P3). No P0.

Fourteen were fixed, one was already closed by other work, and one did not reproduce. Each was deleted from this file as it was settled; what remains is the record of what changed and the verified-clean list.

**`npm test`:** PASS — 171 tests, 0 failures (up from 162: five cover the new single-flight, two the reconnect jitter).

---

## What changed

| Was | Fix |
|---|---|
| **P1** — every `github.ts` loader caught its own failure and returned `[]`/`null`, so `cached()` wrote the failure into KV as if it were good data. One GitHub blip replaced the good copy with an empty list for the full freshness window. Same shape in `spotify.ts`'s two schema escapes. | Loaders throw now; `cached()`'s stale-fallback does its job. New `lib/upstream.ts` holds the shared `ensureOk`/`deadline` helpers and the reasoning. Verified live by pointing the warehouse at a dead port: the log shows `[cache] background refresh failed for warehouse:recent:15` and the visitor still saw real data — previously that path wrote `[]` over it. |
| **P1** — no `AbortSignal` on any GitHub or OAuth fetch, so a hung upstream left a deferred island on its skeleton and the login callback hanging. | `deadline()` (6s, the constant `spotify.ts` already justified) on all five. All six outbound fetches in `src/lib/` now carry one. |
| **P2** — `MusicExplorer` left "loading…" up forever after a cancelled range switch: the `finally` was guarded on `alive`, so switching mid-flight skipped it, and the early return for an already-cached range never cleared the flag. | Reset on the guard path too. |
| **P2** — an R2 or rate-limit failure rendered as "The bucket is empty." | `FileBrowser` tracks failure per prefix, checks `response.ok` and the `error` payload, and a failed folder offers "couldn't load — retry" rather than rendering as empty. |
| **P2** — `NowPlaying` stacked overlapping polls and could apply an older response over a newer one. | Re-arms with `setTimeout` from the end of each attempt instead of `setInterval`, so a poll cannot be scheduled while one is open — stacking is structurally impossible rather than unlikely. Plus abort-on-restart and an 8s deadline. |
| **P2** — once `NowPlaying` had data, every later failure was invisible: a dead endpoint looked identical to a paused track, progress bar still interpolating. | Counts consecutive failures; after three the card keeps the track but drops the "Now playing" label for "Can't reach Spotify — last known", and the interpolation stops rather than inventing progress. |
| **P2** — a warehouse outage rendered as "Nothing listened to in this period." | `initialFailed` threaded from `TopMusic` into `MusicExplorer`, and `RecentTracks` distinguishes the two. Verified with the warehouse pointed at a dead port and the cache cleared: `initialFailed = true`, and RecentTracks renders "Couldn't reach the music warehouse." |
| **P2** — reconnect backoff had no jitter, so every client orphaned by one outage waited the identical time and returned as a thundering herd. | Full jitter, with the RNG injected the same way `open` and `wait` already are — so `cursors.test.ts` and `link.test.ts` still assert exact values instead of degrading to range checks. |
| **P2** — `listWholeTree()` was the one `bucket.list` loop with no page cap: `while (true)` exiting only on `!truncated`. `FULL_TREE_MAX_OBJECTS` bounds objects but not pages, and a bucket of zero-byte or hidden keys advances the cursor without incrementing the count. | Bounded to 20 pages like both siblings, and a still-truncated result returns `null` — the existing "too big, lazy-load instead" signal — rather than a partial tree, which would have been cached and served as though complete. |
| **P3** — a throttled or failed file search read as "Nothing matches". | Checks `response.ok` and the `error` flag, renders "couldn't search just now — try again", and skips the state write entirely on an abort, which also stops the indicator blinking on every keystroke. |
| **P3** — the palette's shell dropped a failed `/shell-fs.json` on the floor, leaving a live prompt over a filesystem that never arrived. | Guarded, with the failure written into the pane using the existing `line()` helper. |
| **P3** — a transient R2 failure was reported to the visitor as a wrangler misconfiguration. | The binding hint is a developer's problem: shown only under `import.meta.env.DEV`. Same treatment applied to `Repos.astro`, which had the identical flaw with `GITHUB_TOKEN`. |
| **P3** — `cached()` had no single-flight, so a cold key let every concurrent request run the loader. | Extracted to `lib/coalesce.ts` — module-scope in-flight map, evicted in a `finally` on both paths. Extracted rather than inlined so it is testable: `cache.ts` imports from `cloudflare:workers`, which will not load under `node --test`, and the failure mode here is worth asserting. Five tests cover it, including the one that matters — a rejection must not poison the key, or one upstream blip replays to every later caller for the isolate's lifetime. |
| **P3** — `ClockTile` started twice on the first page load. | Already fixed. Removing `<ClientRouter />` removed the `astro:page-load` rebind; `start()` now runs once. |
| **P3** — navigating during the multiplayer dynamic import bound the status callback to detached DOM. | Moot. The race needed a soft navigation mid-import, and there are no soft navigations without `<ClientRouter />`. |
| **P3** — `webSocketClose` never closed the server half of the socket. | **Did not reproduce.** Marked UNVERIFIED by the auditor, so it was tested against `wrangler dev` rather than patched blind: `peers` (which is `ctx.getWebSockets().length`) went `0 → 1 → 0` within 1.5s of a client close, with no explicit `ws.close()` anywhere. workerd already releases it. No change made — a defensive close would guard nothing. |

### Note on measuring this

`/api/multiplayer/count` caches its answer for 10 seconds (`presenceCount`), so a fixed URL replays the first reading. The socket test above only works with a cache-busting parameter alongside `room`; without one it reports 0 throughout and looks like a socket that never connected.

---

## Verified clean

Recorded so a future audit does not re-litigate them.

- **Listener accumulation.** `TopBar.astro`, `CommandPalette.astro` and `SettingsMenu.astro` all open with `binding?.abort()` before re-binding and pass `{ signal }` to every listener. Nothing accumulates.
- **`GuestbookList.tsx`.** Correct throughout: `loadingRef` guards re-entry, the `finally` always resets both flags, the API's `{ error: true }` payload *is* checked, and the `IntersectionObserver` is disconnected in cleanup.
- **`GuestbookForm.tsx` double-submit.** A plain `<form method="POST">`; `setPending(true)` disables the button before the navigation, and the island remounts with `pending: false` on the response document. The residual the original audit noted here — `<ClientRouter />` falling back to `location.href` on a failed POST, turning it into a GET and silently discarding the message — no longer exists, since the router was removed.
- **`link.ts`.** The reconnect state machine is sound: generation counters stop a dead socket's `error`-then-`close` pair double-firing, and `halt()` stops retrying a deliberate refusal rather than hammering it. Nothing non-idempotent is retried. Jitter was the only gap and is now closed.
- **Fail-open rate limiting.** `throttle.ts` and the multiplayer Worker both fail open and log. That is the right trade for availability and is documented as such at both sites.
- **`guestbook.ts` / `guestbook.astro`.** Loaders throw rather than returning empty, so `cached()`'s stale fallback works as designed; the page degrades to a labelled `dbReady = false` banner rather than an empty list, and the rate-limit lookup failure is deliberately non-fatal with the reasoning written down.
- **No Spotify token-refresh path exists.** The music-warehouse Worker holds the only grant, so there is no refresh loop, no thundering herd, and no KV token to poison.
