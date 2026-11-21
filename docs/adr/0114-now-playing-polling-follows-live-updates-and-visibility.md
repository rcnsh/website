# 0114. Now-playing polling follows the Live updates preference and tab visibility

The Live updates preference controls polling, not whether the card shows anything: with it off, `NowPlaying` (`src/components/react/NowPlaying.tsx`) makes exactly one request and never polls. The preference is read by a lazy `useState` initialiser, so someone who turned it off never gets the mount poll, and because `lib/prefs` answers true on the server, hydration matches the server markup.

Polling stops while the tab is hidden and restarts immediately on `visibilitychange` to visible, so no requests are spent on an unseen tab and the card is fresh as soon as it is seen.
