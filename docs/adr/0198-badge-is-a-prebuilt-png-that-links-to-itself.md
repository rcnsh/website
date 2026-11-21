# 0198. The 88x31 badge is a PNG generated at prebuild, and links to its own image

Other sites hotlink the 88x31 badge, so it has to be a real raster file. It is rendered by `src/lib/badge.ts` with satori and then sharp, which do not run in workerd, so `scripts/generate-badge.ts` (`npm run badge`) draws it during `npm run generate`, ahead of both dev and build, into `public/badge.png` and `public/badge@2x.png`. Nothing is committed by hand, so the image cannot drift from the code that defines it. `src/lib/badge.ts` has no `@/` imports, because plain `node scripts/generate-badge.ts` cannot resolve the aliases.

`badge.png` at 88x31 is the file other sites hotlink, so its name and size are fixed. The 2x copy exists only for this site's own footer `srcset`. `renderBadge` lays out in 1x badge pixels and multiplies every measurement by `scale`, so the 2x copy is drawn natively rather than upscaled, which would blur it.

The footer's badge links to its own image file rather than to a page: the only reason to click an 88x31 button on the site it advertises is to take it for your own.

satori cannot render inline SVG polygons and accepts only an `<img>`, so `logoSvg` in `src/lib/logo.ts` returns a standalone SVG string at an explicit pixel size, which `badge.ts` embeds as a data URI `<img>`. On the badge's dark plate the mark's own `#305b99` has only about 2.5:1 contrast, so on a dark ground the mark uses the lifted blues `#7f8ad0` and `#6f9bd8`, in polygon order. The badge has a 1px border in the line colour because it sits on other sites against backgrounds of any colour and needs its own edge.
