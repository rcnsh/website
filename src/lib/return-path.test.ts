import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RETURN_PATH, returnPath } from "./return-path.ts";

test("keeps same-origin paths", () => {
  assert.equal(returnPath("/blog/edit"), "/blog/edit");
  assert.equal(returnPath("/guestbook"), "/guestbook");
});

test("refuses anything that could leave the site", () => {
  for (const value of [null, "", "blog", "//evil.com", "/\\evil.com", "https://evil.com", "/a?x=//b", "/%2F%2Fevil"]) {
    assert.equal(returnPath(value), DEFAULT_RETURN_PATH, String(value));
  }
});
