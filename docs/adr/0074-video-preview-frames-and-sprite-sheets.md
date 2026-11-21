# 0074. Video preview frames are sized and timed by a DOM-free maths module

Preview layout and signal maths live in `src/lib/preview-math.ts`, which has no DOM and no Mediabunny import. It tests under node, and importing it never pulls Mediabunny into the page bundle.

`fitBox` gives the largest box of the source's aspect ratio inside the maximum, in whole pixels, at least 1, and never larger than the source. Upscaling only costs bytes, and handing `CanvasSink` an exact size means `fit: "contain"` never letterboxes more than a rounding pixel.

Sprite sheets (`spriteLayout`) default to 6 frames per row (`DEFAULT_COLUMNS`), which keeps a sheet close to square, and stay within `WEBP_MAX_DIMENSION` (16383), since WebP refuses anything wider or taller than 16383px.

Strip timestamps (`stripTimestamps`) are the midpoints of `frames` equal slices of the duration, so neither the black first frame nor the end card is picked. The poster frame (`posterTimestamp`) is taken at min(10% of duration, 10s) from the start: far enough past a fade-in, early enough to be representative.
