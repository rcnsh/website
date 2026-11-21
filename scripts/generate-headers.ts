import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { headersFile } from "../shared/security.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/_headers");

await writeFile(OUT, headersFile());
console.log("[headers] wrote public/_headers");
