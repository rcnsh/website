# 0072. Bound the memory a preview panel holds

A preview is a few ranged reads, so the `UrlSource` in `openInput` (`src/lib/media-preview.ts`) caps its cache at 16 MiB. Mediabunny's 64 MiB default would let one panel hold a whole video in memory.

Canvases are pooled by how long they live. `renderPoster`'s `CanvasSink` uses no pool, because the returned canvas is kept for as long as the panel shows it and a pooled canvas would be reused and overwritten. `renderStrip`'s `CanvasSink` uses `poolSize: 2`, because each decoded frame is copied into the sprite sheet at once, so only two canvases are ever live. Strip tiles are up to 240x240 (`STRIP_TILE_MAX`), because they are shown full-size while scrubbing, larger than a tooltip thumbnail.

Waveform peaks are reduced chunk by chunk from each decoded `AudioBuffer`, which is then dropped, so memory stays flat however long the file is.
