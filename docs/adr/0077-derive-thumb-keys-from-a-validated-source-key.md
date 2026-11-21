# 0077. Derive thumb keys on the server from a validated source key

`src/lib/thumbs.ts` holds the `.thumbs/` key layout and is dependency-free, because the Worker routes and the browser both import it and `node --test` loads it. Thumb targets are derived on the server from the source key; the client never names a path, so nothing can be written outside `.thumbs/`.

Because targets are derived from it, `isVisibleKey` accepts only keys naming a visible object: valid under `objectKey`, no leading slash, no empty or hidden segments, no control characters, and within `MAX_SOURCE_KEY_BYTES`. Anything weaker could write outside `.thumbs/` or thumb hidden objects. `MAX_SOURCE_KEY_BYTES` is 1024 minus `THUMBS_PREFIX`, `.strip.webp` and 8 bytes, so any source key that passes still fits R2's 1024-byte key limit once prefixed and suffixed. The longest suffix is `.poster.webp`, one byte longer than `.strip.webp`; the 8-byte slack covers it.

Thumb kinds are matched against key suffixes longest first (`src/lib/media.ts`), because a shorter kind could otherwise match the tail of a longer one. `thumbSet` reports `strip` only when `strip.webp` and `strip.json` are both present, because the sheet cannot be cut up without its sidecar.
