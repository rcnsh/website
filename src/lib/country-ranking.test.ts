import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { rankCountries } from "./country-ranking.ts";

describe("country ranking", () => {
  test("empty counts rank nothing", () => {
    assert.deepEqual(rankCountries({}), { top: [], rest: [] });
  });

  test("busiest first, ties broken by code, shares relative to the busiest", () => {
    const { top, rest } = rankCountries({ US: 4, GB: 8, DE: 4 });
    assert.deepEqual(
      top.map((c) => [c.code, c.count, c.share]),
      [
        ["GB", 8, 1],
        ["DE", 4, 0.5],
        ["US", 4, 0.5],
      ],
    );
    assert.deepEqual(rest, []);
  });

  test("past the cut, the tail lands in rest in the same order", () => {
    const { top, rest } = rankCountries({ A1: 5, B1: 4, C1: 3, D1: 3 }, 2);
    assert.deepEqual(top.map((c) => c.code), ["A1", "B1"]);
    assert.deepEqual(rest.map((c) => c.code), ["C1", "D1"]);
  });

  test("zero counts are dropped", () => {
    assert.deepEqual(rankCountries({ GB: 0, US: 3 }).top.map((c) => c.code), ["US"]);
  });
});
