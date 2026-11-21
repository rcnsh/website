# 0135. Mini player box: stacking, tap versus drag, and partial redraws

The mini player (`src/components/player/MiniPlayer.astro`) sits at `z-index: 90`, under the command palette (`z-[100]`) and over the sticky header (`z-50`).

Its video doubles as a play/pause target and a drag handle, so a pointer press that moves less than `DRAG_THRESHOLD_PX` (4px) is a tap that toggles playback, and more starts a drag.

The box's `render` redraws fully only when `track`, `paused` or `failed` change; on other updates it touches only the clock and seek bar, since `timeupdate` fires many times a second.

See ADR-0136.
