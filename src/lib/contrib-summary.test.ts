import { test } from "node:test";
import assert from "node:assert/strict";
import { summarise } from "./contrib-summary.ts";

const day = (date: string, count: number) => ({ date, count, level: count ? 1 : 0 });

test("a streak runs across the week boundary", () => {
  const weeks = [
    [day("2026-01-03", 0), day("2026-01-04", 2)],
    [day("2026-01-05", 1), day("2026-01-06", 4), day("2026-01-07", 0)],
  ];
  assert.equal(summarise(weeks).longestStreak, 3);
});

test("this week is the last, partial week only", () => {
  const weeks = [[day("2026-01-01", 9)], [day("2026-01-08", 2), day("2026-01-09", 3)]];
  assert.equal(summarise(weeks).thisWeek, 5);
});

test("the busiest day keeps the first of a tie", () => {
  const weeks = [[day("2026-01-01", 5), day("2026-01-02", 5), day("2026-01-03", 1)]];
  assert.equal(summarise(weeks).busiest?.date, "2026-01-01");
});

test("an empty year has no busiest day and no streak", () => {
  assert.deepEqual(summarise([[day("2026-01-01", 0)]]), {
    longestStreak: 0,
    thisWeek: 0,
    busiest: null,
  });
  assert.equal(summarise([]).busiest, null);
});
