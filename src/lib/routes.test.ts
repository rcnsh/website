import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { AGENT_RESOURCES } from "./agent-docs.ts";

/**
 * The catalogue in agent-docs.ts is published to the world — in /llms.txt, on
 * /docs, in the MCP resource list and on the 404 page. A path in it that no
 * longer resolves sends every agent that reads the site into a dead end, and
 * nothing else would catch it: the strings type-check perfectly.
 *
 * So each catalogue path is resolved back to the file that serves it. Renaming
 * or deleting a route without updating the catalogue fails here.
 */

const root = new URL("../../", import.meta.url);
const has = (path: string) => existsSync(fileURLToPath(new URL(path, root)));

/** Every file Astro would route the given pathname to. Any one is enough. */
function candidatesFor(path: string): string[] {
  if (path === "/") return ["src/pages/index.astro"];

  const bare = path.replace(/^\//, "");

  return [
    // A page or an endpoint, by either name.
    `src/pages/${bare}.astro`,
    `src/pages/${bare}.ts`,
    `src/pages/${bare}/index.astro`,
    `src/pages/${bare}/index.ts`,
    // An extension already in the path, e.g. /llms.txt or /rss.xml.
    `src/pages/${bare}.ts`,
    // A static asset.
    `public/${bare}`,
  ];
}

/* Produced by an integration rather than a file of ours. */
const GENERATED = new Set(["/sitemap-index.xml"]);

test("every catalogued path is served by a file in this repo", () => {
  for (const resource of AGENT_RESOURCES) {
    if (GENERATED.has(resource.path)) continue;

    assert.ok(
      candidatesFor(resource.path).some(has),
      `${resource.path} is advertised but nothing serves it`,
    );
  }
});

test("the sitemap integration that generates the rest is installed", () => {
  // The one catalogue entry with no source file of its own.
  assert.ok(has("astro.config.ts"));
  assert.ok(has("node_modules/@astrojs/sitemap"));
});

test("the pages that claim to serve Markdown opt out of prerendering", async () => {
  /*
    On Cloudflare a prerendered route is served by the asset store and the
    Worker never runs, so its middleware never reads the Accept header. A page
    marked `negotiatesMarkdown` that is still prerendered would advertise a
    Markdown variant it cannot produce.
  */
  const { readFile } = await import("node:fs/promises");

  for (const resource of AGENT_RESOURCES) {
    if (!resource.negotiatesMarkdown) continue;

    const file = candidatesFor(resource.path).find(has);
    assert.ok(file, `${resource.path}: no source file`);

    const source = await readFile(fileURLToPath(new URL(file, root)), "utf8");
    assert.match(
      source,
      /export const prerender = false/,
      `${resource.path} promises Markdown but is prerendered`,
    );
    assert.match(
      source,
      /prefersMarkdown/,
      `${resource.path} promises Markdown but never checks for it`,
    );
  }
});

test("the MCP endpoint and the well-known files exist where advertised", () => {
  assert.ok(has("src/pages/mcp.ts"));
  assert.ok(has("src/pages/.well-known/mcp.json.ts"));
  assert.ok(has("src/pages/.well-known/agent-instructions.md.ts"));
});

test("nothing still ships the static robots.txt the route replaced", () => {
  // Both would resolve; the asset would win and silently shadow the route.
  assert.ok(!has("public/robots.txt"));
  assert.ok(has("src/pages/robots.txt.ts"));
});
