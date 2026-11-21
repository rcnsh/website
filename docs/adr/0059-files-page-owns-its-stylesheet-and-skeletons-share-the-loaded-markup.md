# 0059. The /files page owns its stylesheet, and its skeletons share the loaded markup

`src/pages/files.astro` imports `src/components/files/browser.css` itself. CSS that arrives with an island or a lazy chunk is dropped by the router's head swap on the next soft navigation; a page-level import stays the page's own.

The FilesRoot island's fallback renders `FilesHero`, `FilesUsage` and `BrowserSkeleton` at the island's sizes, so nothing shifts when the island arrives. `src/components/files/BrowserSkeleton.astro` reuses `FileBrowser`'s toolbar, column and footer classes, so `browser.css` sizes the skeleton and the loaded island identically. Only on a phone does height depend on content (columns stack and grow with their rows), so the skeleton draws 4 root rows and 3 preview rows, matching the bucket root's four folders and the preview of the first.

`src/components/files/FilesHero.astro` renders both the page's fallback (totals `undefined`, pending bars) and the island's loaded tile (totals, or `null` for unavailable), so the swap from fallback to island changes nothing but the facts row. The island's wrapper in `FilesRoot.astro` carries `data-risen`, because the fallback already played the entrance animation and the swap would otherwise replay it (see `[data-risen]` in `global.css`, and ADR-0193).
