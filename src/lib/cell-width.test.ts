import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellWidth } from "./cell-width.ts";

describe("cellWidth", () => {
  it("gives ASCII, Latin and box drawing one column", () => {
    for (const char of ["a", " ", "~", "é", "ß", "Ж", "│", "→"]) {
      assert.equal(cellWidth(char), 1, char);
    }
  });

  it("gives East Asian wide and fullwidth characters two columns", () => {
    for (const char of ["漢", "字", "あ", "カ", "한", "　", "Ａ", "！", "￥", "𠀋"]) {
      assert.equal(cellWidth(char), 2, char);
    }
  });

  it("gives emoji with emoji presentation two columns", () => {
    for (const char of ["🙂", "🚀", "⌚", "⭐", "✅"]) {
      assert.equal(cellWidth(char), 2, char);
    }
  });

  it("keeps half-width katakana and text-style symbols narrow", () => {
    for (const char of ["ｶ", "☺", "©"]) {
      assert.equal(cellWidth(char), 1, char);
    }
  });
});
