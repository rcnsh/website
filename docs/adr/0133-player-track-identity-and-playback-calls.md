# 0133. Player tracks are identified by bucket key; playback calls fail quietly

A player track is identified by its bucket key (`src/lib/player-state.ts`): same key, same file. `play()` with the current track only seeks, and `dock()` matches previews by key.

Before metadata loads, a seek is stored as `pendingSeek` and applied on `loadedmetadata`, and `save()` reports it as the time; setting `currentTime` before metadata is unreliable and the element still reads 0 then. `play()`'s promise rejection is swallowed, because it is refused by autoplay policy or superseded and the snapshot already reports paused. `toggle()` on a failed track loads it again: that is the retry.

In `src/components/player/usePlayer.ts`, `usePlayerValue`'s selector must return a primitive. `useSyncExternalStore` compares snapshots by identity, so a selector returning a new object each call re-renders forever.
