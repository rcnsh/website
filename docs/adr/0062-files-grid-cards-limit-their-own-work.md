# 0062. Files grid cards limit their own work

A grid shows many cards at once, and each may need a metadata fetch (a Worker round trip), an art decode or a text read. Started together they would be slow and memory-heavy.

Grid work goes through `queue` (`src/components/files/client.ts`), a FIFO concurrency limiter: metadata requests run through `queue(3)` and art decodes through `queue(1)` (`src/components/files/Previews.tsx`). Cards do not load images larger than `CARD_IMAGE_MAX_BYTES` (8 MiB) as thumbnails; past that size it is a file to open. `readHead` asks for a `Range` of `TEXT_PREVIEW_BYTES` and also stops reading the body there, because a server that ignores `Range` sends the whole file. A failed art promise is removed from `artCache`, so one transient failure is not replayed every time the card shows.
