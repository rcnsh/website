# 0112. Now-playing refreshes at the end of a track and retries across a cache window

Track end is the one moment where the 30-second poll cadence would be visible, so when interpolated progress reaches the duration, `NowPlaying` (`src/components/react/NowPlaying.tsx`) refreshes immediately and retries while the finished track is still reported.

Spotify keeps reporting a finished track for a few seconds, and the route may serve that answer for a whole 10-second cache window, so retries must span more than one window: the client retries every `END_RETRY_MS` (3s) up to `END_RETRIES` (8) times (`src/lib/now-playing.ts`). The attempt is tracked per track key with its count and time; a boolean reset per payload would re-fire every second while Spotify reports the old track.

The progress effect keys a track by `${title}|${durationMs}`. Every poll makes a new payload object, so object identity would restart on every poll; a track repeated back to back is caught by the ordinary poll instead. The progress fill is keyed the same way, so a new track remounts at its start instead of animating backwards.
