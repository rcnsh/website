# 0063. File metadata is cached for one visit

File metadata does not change for a given upload, so `fetchMeta` (`src/components/files/client.ts`) caches it per key in `metaCache`. The router keeps the document across pages, so the cache would otherwise outlive the visit and show stale details for a file re-uploaded meanwhile. `FileBrowser`'s unmount clears it (`forgetMeta`) along with the owner check, so both are per visit. A rejected request is evicted from the cache, since keeping it would replay one transient failure for the rest of the visit.

`useFilesSource` (`src/components/files/useFilesSource.ts`) does not dispose the source in its effect cleanup. StrictMode and fast refresh remount and reuse the same source, so disposing it on the first unmount would freeze the view; the store already unsubscribes on unmount.
