import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPreview } from "./markdown-preview.ts";

test("renders the GFM the posts use", () => {
  const html = renderPreview("| a |\n| - |\n| b |\n\n~~gone~~ and a note[^1]\n\n[^1]: Here.\n\n- [x] done\n");
  assert.match(html, /<table>/);
  assert.match(html, /<del>gone<\/del>/);
  assert.match(html, /data-footnote-ref/);
  assert.match(html, /type="checkbox"/);
});

test("passes raw HTML through, as the build does", () => {
  assert.match(renderPreview("<kbd>K</kbd>"), /<kbd>K<\/kbd>/);
});
