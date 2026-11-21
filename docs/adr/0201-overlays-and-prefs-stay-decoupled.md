# 0201. Overlays and settings coordinate through events and a dependency-free prefs module

The full-screen overlays (the palette and the settings menu) never import each other. They coordinate through a document event in `src/lib/overlays.ts`: whichever opens announces itself with `overlayOpened`, and the others, listening through `closeOnOtherOverlay` with the page's abort signal, close. Only opening is announced, so a close cannot cascade into other closes.

The settings-menu switches and their `localStorage` storage live in `src/lib/prefs.ts` (`readPref`, `writePref`, the `rcn:pref` change event, keys `rcn:<key>`). It lands in eager bundles, so its imports cost every page, and it stays dependency-free; the components that use it never import each other either. Every storage access is wrapped in try/catch, because private browsing throws on storage access.

A write that storage refuses is swallowed and the change event still fires: the choice will not survive the tab, but it takes effect now.
