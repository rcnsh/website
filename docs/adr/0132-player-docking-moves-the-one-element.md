# 0132. Previews dock the one media element; docking moves it between hosts

Previews in `src/components/react/MediaPreview.tsx` own no media element; they dock the site-wide player's. The media element lives in the floating box or docked in the /files preview of the same file, and `place()` (`src/lib/player.ts`) moves it to whichever host it belongs in now. It moves the element with `moveBefore` when available and both nodes are connected, falling back to `appendChild` if that throws (different documents or a detached host). A plain append keeps playback by the letter of the spec, since the element is never out of the document at a stable state, but Chrome has been known to stutter on it.

Docking is a ref callback (`useDock`), because a media element out of the document at the next stable state is paused, and React runs a ref's cleanup in the same synchronous commit that removes its node, where a passive effect would run too late. `dock()` returns its undock, and the player takes the element back into the box before a swap removes the host, so it is never removed along with a swapped-out host. `place()` drops a dock host that has left the document, so a host removed without undocking, which should not happen, does not keep the element. `stop()` clears `dockHost`: nothing plays, so nothing is docked, and a `play()` that runs before the preview's ref cleanup must not land in that preview.

When playback fails, the video and audio previews keep a hidden dock host (`<span ref={host} hidden />`). Staying docked keeps the floating box from showing the same failure over the page.

The element shows native controls only while docked, since the floating box draws its own.

`usePlayer` re-renders on `timeupdate` at about 4 Hz. The video stage subscribes to player state without the playback clock, and the audio preview reads it through `usePlayerValue` selectors scoped to its own file, so another file's playback does not re-render every preview.
