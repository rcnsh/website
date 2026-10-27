import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderNowCard } from "./now-card.ts";

describe("now card", () => {
  test("a live track gets the pulsing dot", () => {
    const svg = renderNowCard({ state: "playing", title: "Alright", artists: "Kendrick Lamar" }, "light");
    assert.match(svg, /<circle/);
    assert.match(svg, /listening now: Alright by Kendrick Lamar/);
  });

  test("the fallback has no dot and says its window", () => {
    const svg = renderNowCard({ state: "repeat", title: "Alright", artists: "Kendrick Lamar" }, "dark");
    assert.doesNotMatch(svg, /<circle/);
    assert.match(svg, /on repeat: Alright by Kendrick Lamar \(last 7 days\)/);
    assert.match(svg, /#f0f6fc/);
  });

  test("names are escaped, so a title can't break the markup", () => {
    const svg = renderNowCard({ state: "playing", title: "<b>&", artists: "\"x\"" }, "light");
    assert.match(svg, /&lt;b&gt;&amp;/);
    assert.doesNotMatch(svg, /<b>/);
  });

  test("long names are clipped", () => {
    const svg = renderNowCard({ state: "playing", title: "a".repeat(200), artists: "b" }, "light");
    assert.doesNotMatch(svg, /a{60}/);
    assert.match(svg, /…/);
  });
});
