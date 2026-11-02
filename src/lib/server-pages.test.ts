import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { needsFullLoad, SERVER_PAGES } from "./server-pages.ts";

const PAGES = join(import.meta.dirname, "..", "pages");

test("SERVER_PAGES is exactly the .astro pages that opt out of prerendering", async () => {
  const files = (await readdir(PAGES, { recursive: true })).filter(
    (file) => file.endsWith(".astro") && !file.startsWith("api"),
  );
  const found: string[] = [];
  for (const file of files) {
    const source = await readFile(join(PAGES, file), "utf8");
    if (/export const prerender\s*=\s*false/.test(source)) {
      found.push(`/${relative(PAGES, join(PAGES, file)).replace(/(\/index)?\.astro$/, "")}`);
    }
  }
  assert.deepEqual(found.sort(), [...SERVER_PAGES].sort());
});

test("API routes and server pages load in full; prerendered pages do not", () => {
  assert.equal(needsFullLoad("/api/auth/login"), true);
  assert.equal(needsFullLoad("/guestbook"), true);
  assert.equal(needsFullLoad("/files"), false);
  assert.equal(needsFullLoad("/blog/building-terminus"), false);
});

test("files that are not pages load in full", () => {
  assert.equal(needsFullLoad("/rss.xml"), true);
  assert.equal(needsFullLoad("/now.svg"), true);
  assert.equal(needsFullLoad("/blog.html"), false);
});
