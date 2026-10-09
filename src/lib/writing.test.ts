import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cadence, wordCount } from "./writing.ts";
import { readingTime } from "./utils.ts";

describe("word count", () => {
  test("drops fenced and inline code", () => {
    assert.equal(wordCount("one two\n```ts\nconst a = 1;\n```\nthree `four` five"), 4);
  });

  test("agrees with readingTime", () => {
    const body = "word ".repeat(1234);
    assert.equal(readingTime(body), Math.max(1, Math.round(wordCount(body) / 200)));
  });

  test("empty body", () => {
    assert.equal(wordCount(""), 0);
    assert.equal(wordCount(), 0);
  });
});

describe("cadence", () => {
  const d = (s: string) => new Date(`${s}T00:00:00Z`);

  test("no posts, no months", () => {
    assert.deepEqual(cadence([], d("2026-10-09")), []);
  });

  test("runs from the first post's month to now", () => {
    const months = cadence([{ date: d("2026-08-14"), draft: true }], d("2026-10-09"));
    assert.deepEqual(months, [
      { year: 2026, month: 7, published: 0, drafts: 1 },
      { year: 2026, month: 8, published: 0, drafts: 0 },
      { year: 2026, month: 9, published: 0, drafts: 0 },
    ]);
  });

  test("counts per month and crosses year boundaries", () => {
    const months = cadence(
      [{ date: d("2025-12-31") }, { date: d("2026-01-01") }, { date: d("2026-01-20") }],
      d("2026-01-25"),
    );
    assert.deepEqual(
      months.map((m) => [m.year, m.month, m.published]),
      [
        [2025, 11, 1],
        [2026, 0, 2],
      ],
    );
  });

  test("keeps only the most recent months", () => {
    const months = cadence([{ date: d("2020-01-01") }, { date: d("2026-10-01") }], d("2026-10-09"), 24);
    assert.equal(months.length, 24);
    assert.deepEqual(months.at(0), { year: 2024, month: 10, published: 0, drafts: 0 });
    assert.equal(months.at(-1)?.published, 1);
  });
});
