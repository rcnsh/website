# 0162. The shell's filesystem is built from the site's content and fetched lazily

`buildFs` in `src/lib/shell-fs.ts` derives the palette shell's tree at build time from `site.json`, the posts and the uses data, so the shell cannot drift from the site's own content. Its `/pages` directory is generated from the nav list, so `ls /pages` and the site's navigation agree by construction. The module is server-only, which keeps the content modules (`astro:content`) out of the client bundle.

The tree reaches the browser only as a prerendered `/shell-fs.json` (`src/pages/shell-fs.json.ts`), fetched on the first open of the shell. Inlining it into every page would add its weight to every page load for a feature few visitors open.
