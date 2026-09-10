import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BADGE_HEIGHT, BADGE_WIDTH, renderBadge } from "../src/lib/badge.ts";

/**
 * Draws the 88x31 button into public/badge.png plus a 2x copy, so it cannot
 * drift from src/lib/badge.ts. Runs ahead of both `dev` and `build`.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The 1x file is the one other people link to; 2x is for this site's footer. */
const SIZES = [
  { scale: 1, file: "badge.png" },
  { scale: 2, file: "badge@2x.png" },
] as const;

for (const { scale, file } of SIZES) {
  await writeFile(path.join(ROOT, "public", file), await renderBadge(scale));
  console.log(
    `[badge] drew ${file} (${BADGE_WIDTH * scale}x${BADGE_HEIGHT * scale})`,
  );
}
