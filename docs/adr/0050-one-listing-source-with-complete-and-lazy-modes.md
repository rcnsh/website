# 0050. One listing source with complete and lazy modes

`src/lib/files-source.ts` is the only source of /files listings. It runs in `complete` mode, where the island inlines the whole tree and nothing is fetched, or `lazy` mode, where only the root is inlined and each folder and search is a request. The mode is hidden from callers, so they stay mode-agnostic. The module has no DOM or React and takes `fetch` injected, so `node --test` drives it.

The island inlines the whole tree only up to `FULL_TREE_MAX_OBJECTS` (5000, `src/lib/bucket-view.ts`). Past that `tree` is null and the source runs lazily, because inlining an unbounded tree bloats the island payload.
