# 0147. The field keeps only the covers in use

Each cover holds a decoded image and a GPU texture, and the field lives for the whole visit, so a tab left open through a listening session would otherwise keep every cover it has seen. After each picture change `src/lib/lattice/field.ts` drops every cover except the `from`, `to`, wanted and currently playing ones (image, texture and size). The playing track's cover is kept through pages that do not draw it, because coming back to one that does would otherwise wait on the image and show the mark meanwhile.

When a cover is redrawn at a new size, the old texture is deleted at once. This is safe because `draw()` binds `textures.get(key)` before falling back to `source.texture`, so a Source still holding the deleted texture never reaches the GPU.
