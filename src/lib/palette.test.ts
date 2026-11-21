import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BADGE_COLOR } from "./badge.ts";
import { OG_COLOR } from "./og.ts";
import { PALETTE_CSS, paletteFrom } from "./palette.ts";

const css = readFileSync(PALETTE_CSS, "utf8");

function token(name: string): string {
  const line = css
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith(`--color-${name}:`));
  assert.ok(line, `no --color-${name} in global.css`);
  return line.slice(line.indexOf(":") + 1).replace(";", "").trim().toLowerCase();
}

test("share card colours are the global.css tokens", () => {
  assert.deepEqual(OG_COLOR, {
    base: token("base"),
    line: token("line"),
    ink: token("ink"),
    inkDim: token("ink-dim"),
    inkFaint: token("ink-faint"),
    brand: token("brand"),
  });
});

test("badge colours are the global.css tokens", () => {
  assert.deepEqual(BADGE_COLOR, {
    base: token("base"),
    raised: token("raised"),
    line: token("line"),
    ink: token("ink"),
    inkDim: token("ink-dim"),
    brand: token("brand"),
  });
});

test("paletteFrom picks a token without matching a longer name", () => {
  const sample = ":root{--color-line-strong: #111111;\n  --color-line: #ABCDEF;}";
  assert.deepEqual(paletteFrom(sample, { line: "line" }), { line: "#abcdef" });
});

test("paletteFrom throws on a missing token", () => {
  assert.throws(
    () => paletteFrom(css, { gone: "no-such-token" }),
    /--color-no-such-token/,
  );
});
