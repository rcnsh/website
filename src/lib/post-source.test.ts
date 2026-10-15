import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePost, postInput, serialisePost } from "./post-source.ts";
import { isSlug, slugify } from "./post-slug.ts";

describe("post source", () => {
  test("round-trips through serialise and parse", () => {
    const post = {
      title: 'Quotes " and: colons   too',
      description: "# not a comment",
      pubDate: "2026-10-10",
      updatedDate: "2026-10-12",
      draft: true,
      body: "Hello\n\n```ts\nconst a = 1;\n```\n",
    };
    assert.deepEqual(parsePost(serialisePost(post)), post);
  });

  test("reads the existing posts unchanged", () => {
    const url = new URL("../content/blog/building-terminus.md", import.meta.url);
    const source = readFileSync(url, "utf8");
    const post = parsePost(source);
    assert.equal(post.pubDate, "2026-10-10");
    assert.equal(post.updatedDate, null);
    assert.deepEqual(parsePost(serialisePost(post)), post);
    assert.ok(source.endsWith(post.body));
  });

  test("refuses frontmatter the build would", () => {
    assert.throws(() => parsePost("no frontmatter"));
    assert.throws(() => parsePost("---\ntitle: x\n---\nbody"));
  });

  test("input dates must be real days", () => {
    const base = { title: "t", description: "d", updatedDate: null, draft: false, body: "" };
    assert.equal(postInput.safeParse({ ...base, pubDate: "2026-02-30" }).success, false);
    assert.equal(postInput.safeParse({ ...base, pubDate: "2026-02-28" }).success, true);
  });

  test("slugs", () => {
    assert.equal(slugify("Building terminus: Part 2!"), "building-terminus-part-2");
    assert.equal(slugify("Café déjà vu"), "cafe-deja-vu");
    assert.ok(isSlug("building-terminus"));
    assert.ok(isSlug("_formatting-reference"));
    assert.ok(!isSlug("edit"));
    assert.ok(!isSlug("../etc"));
    assert.ok(!isSlug("a--b"));
    assert.ok(!isSlug(""));
  });
});
