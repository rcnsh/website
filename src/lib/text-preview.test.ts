import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { firstLines, isTextPreviewable } from "./text-preview.ts";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("which files get a text preview", () => {
  test("text, code and config by extension, case-blind", () => {
    for (const name of ["a.txt", "B.MD", "key.asc", "x/cream_api.ini", "__FILES__.sfv", "rcn.css", "a.tsx"]) {
      assert.equal(isTextPreviewable(name), true, name);
    }
  });

  test("binaries and extensionless names do not", () => {
    for (const name of ["a.exe", "a.zip", "a.pdf", "a.png", "README", "a.dll"]) {
      assert.equal(isTextPreviewable(name), false, name);
    }
  });
});

describe("first lines", () => {
  test("splits on any newline and drops trailing blanks", () => {
    assert.deepEqual(firstLines(bytes("one\r\ntwo\nthree\n\n"), false), ["one", "two", "three"]);
  });

  test("a truncated read loses its cut last line", () => {
    assert.deepEqual(firstLines(bytes("one\ntwo\nthr"), true), ["one", "two"]);
  });

  test("a truncated single line is kept", () => {
    assert.deepEqual(firstLines(bytes("abcdef"), true), ["abcdef"]);
  });

  test("caps the line count and the line length", () => {
    const many = Array.from({ length: 50 }, (_, i) => String(i)).join("\n");
    assert.equal(firstLines(bytes(many), false, 5)?.length, 5);
    const [long] = firstLines(bytes("x".repeat(500)), false) ?? [];
    assert.equal(long.length, 241);
    assert.ok(long.endsWith("…"));
  });

  test("strips a BOM and expands tabs", () => {
    assert.deepEqual(firstLines(bytes("﻿a\tb"), false), ["a  b"]);
  });

  test("a NUL byte means binary", () => {
    assert.equal(firstLines(new Uint8Array([0x4d, 0x5a, 0x00, 0x01]), false), null);
  });

  test("mostly-invalid UTF-8 is refused, a cut character is not", () => {
    const junk = new Uint8Array(Array.from({ length: 200 }, (_, i) => 0x80 + (i % 60)));
    assert.equal(firstLines(junk, false), null);
    const cut = bytes("héllo").slice(0, 2);
    assert.deepEqual(firstLines(cut, true), ["h�"]);
  });
});
