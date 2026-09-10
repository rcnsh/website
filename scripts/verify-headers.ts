// dist/client/_headers is the only source of security headers for prerendered
// pages, and it is generated, gitignored, and silent when it goes missing.
// This runs after astro build and refuses to let a headerless build pass.
import { readFile } from "node:fs/promises";
import { securityHeaders } from "../shared/security.ts";

const PATH = "dist/client/_headers";

const file = await readFile(PATH, "utf8").catch(() => null);

if (!file || file.trim() === "") {
  console.error(
    `[verify-headers] ${PATH} is missing or empty. Every prerendered page would ship with no security headers. Check that "npm run headers" ran.`,
  );
  process.exit(1);
}

const missing = Object.entries(securityHeaders())
  .filter(([name, value]) => !file.includes(`  ${name}: ${value}`))
  .map(([name]) => name);

if (missing.length > 0) {
  console.error(
    `[verify-headers] ${PATH} is missing: ${missing.join(", ")}. It is stale — rerun "npm run headers".`,
  );
  process.exit(1);
}

console.log(
  `[verify-headers] ${PATH} carries all ${Object.keys(securityHeaders()).length} headers.`,
);
