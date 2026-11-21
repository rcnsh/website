# 0047. /files islands render the visitor view, and the owner's view loads after hydration

The /files hero figures, usage tile and browser, and the home page's files figure, show totals that change on every upload while the pages around them do not, so they are server islands. Islands are edge-cached for every reader, so nothing personalised may go in them: they render the visitor view only.

`src/components/widgets/FilesRoot.astro` is one island that renders the hero figures, usage tile and browser from a single tree read, which keeps the three consistent. It inlines the whole listed tree, or only the root when the bucket is past the inline cap. `src/components/home/FilesFigure.astro` counts only listed files through `view(false)`, since totals including hidden files would hint at what is hidden, and shows a generic line when the tree is `null` (the bucket is past the inline cap). Where the usage bar needs to show how much is private, the island takes `publicSummary()`, which returns the listed tree plus hidden totals as sizes only, so visitors see how much is hidden without any names leaking.

The owner's full view loads after hydration. `/api/files/visibility` (`src/pages/api/files/visibility.ts`) returns the folder rules and the full tree to the owner only, and after mount `src/lib/files-source.ts` probes it once and, for the owner, swaps the visitors' listings for the owner's.

The probe runs once per source and reports settled exactly once on every path. `src/components/files/owner-view.ts` lifts the owner hold from that signal (see ADR-0048), so a missed call leaves the hold stuck and a doubled one lifts it early.

When the owner is confirmed, lazy-mode listings, failures and loading state are reset, because everything fetched so far was filtered to the visitors' view. A generation counter is bumped on the swap and responses from an older generation are discarded; otherwise a folder fetched for the visitor that lands after the swap would overwrite the owner's listing with the visitors' view.
