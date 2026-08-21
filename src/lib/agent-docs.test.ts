import { test } from "node:test";
import assert from "node:assert/strict";
import {
  absolute,
  AGENT_RESOURCES,
  buildAgentInstructions,
  buildBlogIndexMarkdown,
  buildHomeMarkdown,
  buildLlmsFullTxt,
  buildLlmsTxt,
  buildNotFoundMarkdown,
  RESOURCE_GROUPS,
  resourcesIn,
  type AgentGuidance,
  type AgentSite,
  type PostSummary,
} from "./agent-docs.ts";

const SITE: AgentSite = {
  name: "rcn.sh",
  url: "https://rcn.sh",
  author: "Jacob Wiltshire",
  tagline: "computer science student",
  description: "Personal site.",
};

const AGENT: AgentGuidance = {
  summary: "A personal site with writing, listening data and public files.",
  whenToUse: ["Answering who Jacob Wiltshire is.", "Reading his posts."],
  whenNotToUse: ["Anything transactional.", "General programming questions."],
  howToCall: "Fetch with `Accept: text/markdown`, or connect to /mcp.",
};

const POSTS: PostSummary[] = [
  {
    title: "First post",
    description: "About something.",
    href: "/blog/first-post",
    date: "2026-02-01",
    body: "The body of the first post.",
  },
];

/* --- The catalogue ------------------------------------------------------- */

test("every catalogue path is site-relative and unslashed", () => {
  for (const resource of AGENT_RESOURCES) {
    assert.ok(
      resource.path.startsWith("/"),
      `${resource.path} is not site-relative`,
    );
    assert.ok(
      resource.path === "/" || !resource.path.endsWith("/"),
      `${resource.path} has a trailing slash; the site sets trailingSlash: never`,
    );
  }
});

test("catalogue paths are unique", () => {
  const paths = AGENT_RESOURCES.map((resource) => resource.path);
  assert.equal(new Set(paths).size, paths.length);
});

test("every resource is described and typed", () => {
  for (const resource of AGENT_RESOURCES) {
    assert.ok(resource.title.length > 0, `${resource.path}: no title`);
    assert.ok(
      resource.description.length >= 20,
      `${resource.path}: description too thin to be useful`,
    );
    assert.match(resource.mimeType, /^[a-z]+\/[a-z0-9.+-]+$/);
  }
});

test("every group is non-empty and every resource is in a known group", () => {
  for (const group of RESOURCE_GROUPS) {
    assert.ok(resourcesIn(group).length > 0, `${group} is empty`);
  }
  const known = new Set<string>(RESOURCE_GROUPS);
  for (const resource of AGENT_RESOURCES) {
    assert.ok(known.has(resource.group), `${resource.path}: unknown group`);
  }
});

test("the routes the audit names are all catalogued", () => {
  const paths = new Set(AGENT_RESOURCES.map((resource) => resource.path));
  for (const required of [
    "/",
    "/about",
    "/contact",
    "/privacy",
    "/docs",
    "/llms.txt",
    "/mcp",
    "/.well-known/mcp.json",
    "/.well-known/agent-instructions.md",
  ]) {
    assert.ok(paths.has(required), `${required} is missing from the catalogue`);
  }
});

test("absolute() joins without doubling the slash", () => {
  assert.equal(absolute("https://rcn.sh", "/about"), "https://rcn.sh/about");
  assert.equal(absolute("https://rcn.sh/", "/about"), "https://rcn.sh/about");
  assert.equal(absolute("https://rcn.sh", "/"), "https://rcn.sh/");
});

/* --- llms.txt ------------------------------------------------------------ */

test("llms.txt has the llmstxt.org shape", () => {
  const output = buildLlmsTxt({ site: SITE, agent: AGENT, posts: POSTS });
  const lines = output.split("\n");

  assert.equal(lines[0], "# rcn.sh — Jacob Wiltshire");
  assert.equal(lines[1], "");
  assert.ok(lines[2]?.startsWith("> "), "line 3 must be the summary blockquote");

  // Exactly one H1.
  assert.equal(output.match(/^# /gm)?.length, 1);
});

test("llms.txt answers when to use the site, by name", () => {
  const output = buildLlmsTxt({ site: SITE, agent: AGENT, posts: POSTS });

  assert.match(output, /^## When to use this$/m);
  assert.match(output, /^## When not to use this$/m);
  assert.match(output, /^## How to call it$/m);
  for (const line of [...AGENT.whenToUse, ...AGENT.whenNotToUse]) {
    assert.ok(output.includes(line), `missing guidance line: ${line}`);
  }
});

test("llms.txt lists every catalogued resource as an absolute link", () => {
  const output = buildLlmsTxt({ site: SITE, agent: AGENT, posts: POSTS });

  for (const resource of AGENT_RESOURCES) {
    const url = absolute(SITE.url, resource.path);
    assert.ok(output.includes(`(${url})`), `${resource.path} not linked`);
  }
  assert.ok(!output.includes("](/"), "links must be absolute, not relative");
});

test("llms.txt lists posts, and omits the section when there are none", () => {
  const withPosts = buildLlmsTxt({ site: SITE, agent: AGENT, posts: POSTS });
  assert.match(withPosts, /^## Writing$/m);
  assert.ok(withPosts.includes("https://rcn.sh/blog/first-post"));

  const empty = buildLlmsTxt({ site: SITE, agent: AGENT, posts: [] });
  assert.ok(!/^## Writing$/m.test(empty));
});

/* --- Agent instructions -------------------------------------------------- */

test("the instruction file names use cases rather than selling", () => {
  const output = buildAgentInstructions({ site: SITE, agent: AGENT });

  assert.match(output, /^# Agent instructions for rcn\.sh$/m);
  assert.match(output, /^## When to use this site$/m);
  assert.match(output, /^## When not to use this site$/m);
  assert.match(output, /^## How to call it$/m);
  assert.ok(output.includes("https://rcn.sh/mcp"));
  assert.ok(output.includes("https://rcn.sh/llms.txt"));
});

/* --- Page bodies --------------------------------------------------------- */

test("the home markdown carries an H1, the bio and the stack", () => {
  const output = buildHomeMarkdown({
    site: SITE,
    agent: AGENT,
    bio: "I study computer science at [Newcastle](https://www.ncl.ac.uk/).",
    stack: [
      { name: "TypeScript", url: "https://www.typescriptlang.org/", primary: true },
      { name: "Docker", url: "https://www.docker.com/" },
    ],
    posts: POSTS,
  });

  assert.equal(output.split("\n")[0], "# Jacob Wiltshire");
  assert.ok(output.includes("I study computer science"));
  assert.ok(output.includes("Day to day: [TypeScript]"));
  assert.ok(output.includes("Also: [Docker]"));
  assert.match(output, /^## Recent writing$/m);
});

test("the home markdown is substantial enough to answer from", () => {
  const output = buildHomeMarkdown({
    site: SITE,
    agent: AGENT,
    bio: "I study computer science.",
    stack: [{ name: "TypeScript", url: "https://www.typescriptlang.org/" }],
    posts: [],
  });

  assert.ok(output.length > 500, `only ${output.length} chars`);
  assert.ok(!/^## Recent writing$/m.test(output));
});

test("the blog index degrades to a real sentence when empty", () => {
  const empty = buildBlogIndexMarkdown({ site: SITE, posts: [] });
  assert.ok(empty.includes("Nothing published yet."));
  assert.ok(empty.includes("https://rcn.sh/rss.xml"));

  const listed = buildBlogIndexMarkdown({ site: SITE, posts: POSTS });
  assert.ok(listed.includes("1 post, newest first"));
  assert.ok(listed.includes("https://rcn.sh/blog/first-post"));
});

/* --- 404 ----------------------------------------------------------------- */

test("the 404 body names the missed path and offers a way out", () => {
  const output = buildNotFoundMarkdown({
    site: SITE,
    pathname: "/does-not-exist",
  });

  assert.match(output, /^# 404 — Not Found$/m);
  assert.ok(output.includes("`/does-not-exist`"));
  assert.ok(output.includes("https://rcn.sh/llms.txt"));
  assert.ok(output.includes("https://rcn.sh/sitemap-index.xml"));
  assert.ok(output.includes("https://rcn.sh/mcp"));

  // Every page a lost agent could want is linked, not just the homepage.
  for (const page of resourcesIn("Pages")) {
    assert.ok(
      output.includes(absolute(SITE.url, page.path)),
      `${page.path} not offered on the 404`,
    );
  }
});

test("the 404 body is long enough to be worth parsing", () => {
  const output = buildNotFoundMarkdown({ site: SITE, pathname: "/nope" });
  assert.ok(output.length > 500, `only ${output.length} chars`);
});

/* --- llms-full.txt ------------------------------------------------------- */

test("llms-full.txt inlines every document and post body", () => {
  const output = buildLlmsFullTxt({
    site: SITE,
    agent: AGENT,
    documents: [
      { path: "/", markdown: "# Home\n\nHello." },
      { path: "/about", markdown: "# About\n\nSome prose." },
    ],
    posts: POSTS,
  });

  assert.ok(output.includes("<!-- https://rcn.sh/ -->"));
  assert.ok(output.includes("<!-- https://rcn.sh/about -->"));
  assert.ok(output.includes("<!-- https://rcn.sh/blog/first-post -->"));
  assert.ok(output.includes("The body of the first post."));
  assert.ok(output.includes("Some prose."));
  assert.ok(output.endsWith("\n"));
});

test("llms-full.txt skips posts with no body", () => {
  const output = buildLlmsFullTxt({
    site: SITE,
    agent: AGENT,
    documents: [],
    posts: [{ ...POSTS[0]!, body: "   " }],
  });

  assert.ok(!output.includes("<!-- https://rcn.sh/blog/first-post -->"));
});
