# 0065. Demux media metadata on the Worker without decoding

Workers have no WebCodecs, so decoding cannot run there. `src/lib/media-meta.ts` uses Mediabunny only to demux: no sinks, no `Conversion`, and no `cloudflare:workers` import, which also lets `node --test` drive it with a fake bucket.

Its `bucketSource` maps each read to one ranged R2 GET and caches nothing itself, because Mediabunny already coalesces and caches the ranges it requests. The read length is `end - start` with no bounds clamping, because Mediabunny guarantees `0 <= start < end <= size` with `end` exclusive.

Reported video width and height are display dimensions, after rotation and pixel aspect ratio, because consumers size the player and stage from them and coded dimensions are wrong for rotated or anamorphic video. A file with neither a video nor an audio track (an MP4 holding only subtitles, for example) reports `{ supported: false }`, because it has nothing to preview.
