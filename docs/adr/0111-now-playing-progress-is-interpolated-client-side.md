# 0111. Now-playing progress is interpolated in the browser between 30s polls

The widget (`src/components/react/NowPlaying.tsx`) polls every 30 seconds (`POLL_MS`) and advances progress locally between polls, and the end of a track triggers its own refresh. The poll cadence therefore only affects how quickly a track change is noticed.

Progress is advanced by `performance.now()` deltas rather than a fixed 1000ms per tick, since a throttled timer would make a fixed step lag.
