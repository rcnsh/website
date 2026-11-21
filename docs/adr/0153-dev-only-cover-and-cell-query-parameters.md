# 0153. Dev-only query parameters for the cover and the cell

Local dev has no music-warehouse token, so no real cover ever arrives and the cover pipeline cannot be checked locally without a stand-in. Comparing cell sizes on real covers would otherwise mean editing code.

In dev, `?cover=<image url>` makes `src/components/Lattice.astro` call `pinCover` (`src/lib/lattice-source.ts`), which publishes that image as the field's cover. Once a cover is pinned, `publishCover` ignores the now-playing widget's updates; otherwise the widget's next poll would replace the test cover with the real (or empty) one and the test cover would vanish. `?cell=<px>` (6 to 64; `cellOverride` in `src/lib/lattice/field.ts`) overrides the home field's wide cell.

Both sit behind `import.meta.env.DEV`, so production builds compile them out.
