# 0091. The guestbook list loads more with an IntersectionObserver re-created per cursor

`GuestbookList.tsx` loads further pages from `/api/guestbook/list` when a sentinel comes within `rootMargin: "600px 0px"` of the viewport. The observer effect re-runs whenever `cursor` changes, which is why its dependency list carries a `biome-ignore`. An IntersectionObserver reports transitions, not states: on a tall screen the sentinel stays inside the margin after a page lands, so no new intersection fires and loading would stall unless the observer is re-created.

The next cursor and the loading flag are kept in refs (`cursorRef`, `loadingRef`) as well as state. `loadMore` is not re-created per render, and one that closed over the first cursor would refetch page two forever.

Each fetched page is de-duplicated against the entries already shown, by id. Cursors cannot overlap, but a delete between two fetches shifts the window, so a row can come back twice. A failed fetch only sets the `failed` flag and leaves the sentinel in place, so an offline or cut-short fetch retries on the next scroll. The sentinel contains a real `<button>`, not a bare div, which keeps loading reachable from the keyboard when the observer does not fire.
