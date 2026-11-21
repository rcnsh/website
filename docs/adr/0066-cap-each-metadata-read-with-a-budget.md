# 0066. Cap each metadata read with a budget

One metadata read in `src/lib/media-meta.ts` is capped at 48 ranged reads and 24 MiB (`READ_BUDGET`). An MP4 with its `moov` at the end needs only four reads; a file near these limits is one whose duration would need an end-to-end scan, which the Worker's CPU limit would kill anyway.

Everything the reader computes stays inside that budget. Duration comes from `getDurationFromMetadata`, not `computeDuration`, and may be null: `computeDuration` can walk every packet, which on an MP3 without a Xing header is the whole file. The frame rate is estimated from the first 90 packets (`FRAME_RATE_PACKETS`), enough for the estimate to settle.

The browser follows the same rule. `trackTiming` in `src/lib/media-preview.ts` uses the duration from `/api/files/meta` when it is known and only falls back to metadata and then `computeDuration`, because recomputing it in the browser can mean reading the whole file.
