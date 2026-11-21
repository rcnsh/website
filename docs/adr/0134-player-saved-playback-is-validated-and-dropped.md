# 0134. Saved playback is validated and dropped rather than trusted

A full load resumes from `sessionStorage` (`rcn:player`). That entry can be stale or edited, so `parseSavedPlayback` (`src/lib/player-state.ts`) validates it and drops any media URL outside the given origins (the site and `BUCKET_ORIGIN`), so it cannot point the player elsewhere. A saved poster may be a `data:image/` URL, since browser-generated posters are data URLs, or a URL from an allowed origin; only images are accepted. A track played through the owner-only `/api/files/download` route is dropped once the owner hint is gone, or the box would go on showing the private file's name to whoever has the tab next.

`restore()` (`src/lib/player.ts`) runs at start and on `pageshow` with `persisted`: a back-forward-cache page's player is as it was left, but the reader may have listened on or closed it in another page. Signing out is a full load, and the private download would only 404 by then. Browsers may refuse sound without a fresh click, so a refused resume waits paused at the saved spot.

`save()` removes the saved entry when writing fails (storage full or walled off): no player on the next page is better than the track before this one.
