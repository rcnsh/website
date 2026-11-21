# 0140. Recover the field from a lost WebGL context

A lost WebGL context comes back empty, and it comes back at all only if the loss was acknowledged with `preventDefault`. The lattice canvas is persisted for the whole visit, so without recovery every later page would inherit a dead context.

On `webglcontextlost` the field (`src/lib/lattice/field.ts`) calls `preventDefault` and stops drawing. On `webglcontextrestored` it runs `build()`, which rebuilds the program, uniforms, palette and mark, and then re-resolves the current page's picture.

`build()` clears the GPU textures but keeps the decoded cover images. `resolve()` treats a key as ready if either its texture or its decoded cover is held, so `show()` redraws the texture from the held image instead of reloading it over the network.
