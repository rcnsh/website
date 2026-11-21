import assert from "node:assert/strict";
import { test } from "node:test";

import { cssPixels } from "./css-length.ts";

test("a rem length is scaled by the root font size", () => {
  assert.equal(cssPixels("74rem", 16), 1184);
  assert.equal(cssPixels(" 74rem ", 20), 1480);
});

test("a px length is read as is", () => {
  assert.equal(cssPixels("1184px", 16), 1184);
  assert.equal(cssPixels("12.5px", 16), 12.5);
});

test("anything else is not a length it can read", () => {
  assert.equal(cssPixels("", 16), null);
  assert.equal(cssPixels("80%", 16), null);
  assert.equal(cssPixels("calc(1rem + 2px)", 16), null);
  assert.equal(cssPixels("rem", 16), null);
});
