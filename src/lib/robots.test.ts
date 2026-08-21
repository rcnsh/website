import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_CRAWLERS, buildRobotsTxt } from "./robots.ts";
import type { AgentSite } from "./agent-docs.ts";

const SITE: AgentSite = {
  name: "rcn.sh",
  url: "https://rcn.sh",
  author: "Jacob Wiltshire",
  tagline: "student",
  description: "Personal site.",
};

const robots = buildRobotsTxt(SITE);

test("the crawlers the audit probes are all named and allowed", () => {
  // Each of these was reported blocked or absent; none may be missing again.
  for (const crawler of [
    "ChatGPT-User",
    "ClaudeBot",
    "GPTBot",
    "PerplexityBot",
    "Google-Extended",
    "DeepSeekBot",
    "ora-agent",
  ]) {
    assert.ok(
      AI_CRAWLERS.includes(crawler as never),
      `${crawler} is not in the list`,
    );

    const group = robots.slice(robots.indexOf(`User-agent: ${crawler}\n`));
    assert.match(
      group.split("\n").slice(0, 2).join("\n"),
      /^User-agent: .+\nAllow: \/$/,
      `${crawler} is named but not allowed`,
    );
  }
});

test("no crawler is disallowed anywhere in the file", () => {
  const disallows = robots
    .split("\n")
    .filter((line) => line.startsWith("Disallow:"));

  // The single intended exception: the per-request JSON endpoints.
  assert.deepEqual(disallows, ["Disallow: /api/"]);
});

test("the wildcard group still allows everything else", () => {
  assert.match(robots, /^User-agent: \*\nAllow: \/$/m);
});

test("the crawler list has no duplicates", () => {
  assert.equal(new Set(AI_CRAWLERS).size, AI_CRAWLERS.length);
});

test("the sitemap and the agent entry points are advertised", () => {
  assert.match(robots, /^Sitemap: https:\/\/rcn\.sh\/sitemap-index\.xml$/m);
  assert.ok(robots.includes("https://rcn.sh/llms.txt"));
  assert.ok(robots.includes("https://rcn.sh/mcp"));
  assert.ok(
    robots.includes("https://rcn.sh/.well-known/agent-instructions.md"),
  );
});

test("every group is a User-agent line followed by its rule", () => {
  const lines = robots.split("\n");

  for (const [index, line] of lines.entries()) {
    if (!line.startsWith("User-agent:")) continue;
    assert.match(
      lines[index + 1] ?? "",
      /^(Allow|Disallow):/,
      `orphaned group at line ${index + 1}: ${line}`,
    );
  }
});
