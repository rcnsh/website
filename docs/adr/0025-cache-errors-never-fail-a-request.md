# 0025. Cache errors never fail a request

A cache exists to make a request cheaper, never to make it fail. In `cached()` (`src/lib/swr.ts`), KV `get` and `put` errors are caught and ignored, so a failed read behaves as a miss and a failed write is lost. A background refresh in the stale window logs its error and does not propagate it, since the visitor has already been served a usable value.

Invalidation follows the same rule. `invalidate()` logs a failed KV delete and does not throw, and `invalidateEdge` (`src/lib/edge-cache.ts`) logs and returns `false`. Callers invalidate after a committed write; failing the request then would report an error for a write that succeeded, and the entry ages out regardless.
