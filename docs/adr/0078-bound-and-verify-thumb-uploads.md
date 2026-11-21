# 0078. Bound and verify every thumb upload

The owner's browser generates thumbs and uploads them to `/api/files/thumbs`, so the route bounds what it can store. Each kind has a fixed type and byte cap in `src/lib/thumbs.ts`: `poster.webp` 512 KiB, `strip.webp` 2 MiB, `strip.json` 16 KiB, `peaks.json` 64 KiB. The route accepts only these.

The whole body is bounded before `formData()` parses it. `MAX_THUMBS_REQUEST_BYTES` is the sum of the kind caps plus 64 KiB, and `src/pages/api/files/thumbs.ts` requires a positive `content-length` (411 otherwise) and refuses anything larger (413) before reading, because a chunked body without a length could stream past the cap into `formData()`.

Each part is checked for declared type, size cap and magic bytes, because a client-declared content type is only a claim. For the same reason `encodeWebp` in `src/lib/media-preview.ts` throws if the browser's output is not WebP: Safari hands back a PNG instead, which the route would refuse.
