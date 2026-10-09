import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { clampIndex, keyAction } from "./files-keys.ts";

const LIST = { view: "list", columns: 1 } as const;
const GRID = { view: "grid", columns: 4 } as const;

describe("key → action", () => {
  test("vim keys and arrows move in a list", () => {
    for (const key of ["j", "ArrowDown"]) assert.deepEqual(keyAction({ key }, LIST), { type: "move", by: 1 });
    for (const key of ["k", "ArrowUp"]) assert.deepEqual(keyAction({ key }, LIST), { type: "move", by: -1 });
  });

  test("in a grid, j/k move a row and ←/→ move a card", () => {
    assert.deepEqual(keyAction({ key: "j" }, GRID), { type: "move", by: 4 });
    assert.deepEqual(keyAction({ key: "ArrowUp" }, GRID), { type: "move", by: -4 });
    assert.deepEqual(keyAction({ key: "ArrowRight" }, GRID), { type: "move", by: 1 });
    assert.deepEqual(keyAction({ key: "ArrowLeft" }, GRID), { type: "move", by: -1 });
  });

  test("in a list, ←/→ go out and in", () => {
    assert.deepEqual(keyAction({ key: "ArrowRight" }, LIST), { type: "open" });
    assert.deepEqual(keyAction({ key: "ArrowLeft" }, LIST), { type: "up" });
  });

  test("open and parent", () => {
    for (const key of ["l", "Enter"]) assert.deepEqual(keyAction({ key }, GRID), { type: "open" });
    for (const key of ["h", "Backspace"]) assert.deepEqual(keyAction({ key }, GRID), { type: "up" });
  });

  test("the single-letter commands", () => {
    assert.deepEqual(keyAction({ key: "/" }, LIST), { type: "search" });
    assert.deepEqual(keyAction({ key: "s" }, LIST), { type: "sort" });
    assert.deepEqual(keyAction({ key: "r" }, LIST), { type: "reverse" });
    assert.deepEqual(keyAction({ key: "v" }, LIST), { type: "view" });
    assert.deepEqual(keyAction({ key: "y" }, LIST), { type: "copy" });
    assert.deepEqual(keyAction({ key: " " }, LIST), { type: "toggle-play" });
    assert.deepEqual(keyAction({ key: "Escape" }, LIST), { type: "escape" });
    assert.deepEqual(keyAction({ key: "g" }, LIST), { type: "first" });
    assert.deepEqual(keyAction({ key: "G" }, LIST), { type: "last" });
  });

  test("modified presses are never taken — ⌘K is the palette's", () => {
    assert.equal(keyAction({ key: "k", metaKey: true }, LIST), null);
    assert.equal(keyAction({ key: "k", ctrlKey: true }, LIST), null);
    assert.equal(keyAction({ key: "ArrowLeft", altKey: true }, LIST), null);
  });

  test("anything else is left alone", () => {
    assert.equal(keyAction({ key: "x" }, LIST), null);
    assert.equal(keyAction({ key: "Tab" }, LIST), null);
  });

  test("a grid reporting no columns still moves", () => {
    assert.deepEqual(keyAction({ key: "j" }, { view: "grid", columns: 0 }), { type: "move", by: 1 });
  });
});

describe("clampIndex", () => {
  test("stays inside the list", () => {
    assert.equal(clampIndex(-3, 5), 0);
    assert.equal(clampIndex(9, 5), 4);
    assert.equal(clampIndex(2, 5), 2);
    assert.equal(clampIndex(0, 0), -1);
  });
});
