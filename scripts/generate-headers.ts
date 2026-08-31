import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { headersFile } from "../shared/security.ts";

/**
 * Writes public/_headers from shared/security.ts.
 *
 * The file is generated rather than committed for the same reason the share
 * cards are: it is derived, and a derived file kept in git is a file that can
 * disagree with what it was derived from. Runs ahead of both `dev` and
 * `build`; see package.json.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/_headers");

await writeFile(OUT, headersFile());
console.log("[headers] wrote public/_headers");
