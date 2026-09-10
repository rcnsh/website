/*
  Most of this site is prerendered, and a prerendered response never reaches
  src/middleware.ts — Workers Static Assets answers ahead of the Worker. Its
  security headers come from dist/client/_headers, written by
  generate-headers.ts out of shared/security.ts.

  shared/security.test.ts proves the two sources agree. It cannot prove the
  file made it into the build: public/_headers is gitignored and regenerated,
  so if generate-headers.ts fails or is dropped from the `generate` chain,
  every prerendered page loses every security header and nothing says so. The
  only signal today is a wrangler log line.

  So this runs after astro build and refuses to let a headerless build pass.
*/
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
