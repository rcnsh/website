# 0113. Now-playing requests never overlap or rewind the bar

Two now-playing requests open at once can land out of order and make the progress bar jump backwards, so `NowPlaying` (`src/components/react/NowPlaying.tsx`) keeps at most one in flight.

The next poll is scheduled with `setTimeout` after each attempt finishes, and any restart clears the queued timer first, so a poll is never scheduled while the previous one is open and an immediate refresh does not leave the old timer to fire seconds later. Each poll also aborts the previous request; an aborted request is the widget replacing its own request, not an upstream failure, so it is not counted as one. Each request times out at 8 seconds (`REQUEST_TIMEOUT_MS`), well under the poll interval, so requests cannot stack up.

The client fetches `/api/spotify/now-playing` with `cache: "no-store"`, because a browser-cached copy carries an un-advanced `progressMs` and rewinds the bar. The refresh function passes from the polling effect to the progress effect through a ref, not state, since render never reads it and state would cause needless re-renders.
