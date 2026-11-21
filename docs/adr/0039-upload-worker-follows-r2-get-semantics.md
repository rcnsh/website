# 0039. The upload Worker follows R2's get semantics

`workers/upload/src/handler.ts` passes the request's Range and conditional headers straight to R2 `get()` and translates what comes back into the response R2's public endpoint would give.

R2 throws on a range it cannot satisfy, so a `get` error with a Range header answers 416, and without one it rethrows as a real failure. R2 returns an object without a body when a request condition fails, so that answers 304 if `if-none-match` or `if-modified-since` was sent, else 412. A 206 with `Content-Range` is sent only when the request carried a Range header, because `object.range` being set does not mean only part was asked for; this follows Cloudflare's own R2 Worker example.

`span()` checks range fields with `typeof`, not `in`. R2 returns every range field, unset ones as undefined, so `in` is always true.
