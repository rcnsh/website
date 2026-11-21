# 0068. Media metadata failures rethrow; only over-budget is cached

Media metadata is cached for the life of its entry, which is effectively forever (`META_FRESH_SECONDS`, one year, in `src/lib/media.ts`), so anything that looks like a result is permanent. A transient R2 error turned into `{ supported: false }` would mark a playable file unsupported for good.

`readMediaMeta` in `src/lib/media-meta.ts` propagates every read failure, and a null object mid-read throws, so an object deleted between the head and a read is never cached as unsupported. In `src/lib/media.ts` only a read-budget overrun is caught and cached as `{ supported: false }`, because being over budget is a property of the file; every other error rethrows. `src/lib/media-meta.test.ts` pins this: a failing bucket read must reject rather than resolve to `{ supported: false }`.

See ADR-0067.
