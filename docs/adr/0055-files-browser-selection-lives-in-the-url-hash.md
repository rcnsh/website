# 0055. The files browser's selection lives in the URL hash

A folder or file in /files can be linked by its hash, and `FileBrowser` (`src/components/react/FileBrowser.tsx`) writes the selection back to it. Selection changes use `history.replaceState`, since pushing on every j/k step would fill history and bury the back button. Copying a link swallows a failed clipboard write: the browser may block clipboard access, and the link itself still works.

Deep links are applied in a layout effect on mount, so the root does not paint for a frame before the jump. The browser listens to both `hashchange` and `popstate`, because Astro's router navigates to a same-page `#` link with `pushState`, which fires no `hashchange`, and then dispatches its own `popstate`. The handler skips a hash it already applied, since a Back between two hashes fires both. The listener is bound once on mount but calls `applyHash` through a ref updated every render, because the owner's listings arrive later and a captured closure would apply hashes against stale ones.

Writing the selection back waits for `accessChecked`. Before the owner check settles, a link into a folder visitors cannot see looks broken, and writing the selection back would erase it. When the reader is the owner the hash is re-applied then; the owner's tree lands in the same render as `accessChecked`, so the retry sees it.
