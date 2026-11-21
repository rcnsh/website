# 0217. Brand marks are generated from simple-icons into a checked-in file

The /uses page shows the brand mark of each piece of software it lists. simple-icons has thousands of marks, and importing it at runtime would ship all of them for the handful the page uses.

`scripts/generate-brand-marks.ts` (`npm run marks`) reads a `WANTED` map from site.json `art` names to simple-icons slugs and writes only those marks, as `BRAND_MARKS` (title and 24x24 path), to `src/lib/brand-marks.ts`. That file is output: a hand edit is overwritten on the next run, so a change goes into `WANTED` and the script is rerun. The paths come from simple-icons, and the marks remain their owners' trademarks. Apps simple-icons lacks are drawn by hand in `src/components/uses/UsesArt.astro`.

A `WANTED` slug with no simple-icons entry logs a `[marks]` warning and is skipped; the script does not fail. The page still builds, and the affected items lose only their mark, for which UsesArt draws its dashed placeholder.

## Consequences

The generated file carries no "do not edit" header, so nothing in `src/lib/brand-marks.ts` itself tells a reader it is generated.
