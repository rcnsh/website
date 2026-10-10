import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  cover,
  heatLevel,
  linePath,
  monthLabel,
  monthRange,
  niceShareMax,
  peakHour,
  percent,
  quarterLabel,
  statsYears,
  yearSwitchCss,
  shareBetween,
} from "./music-stats-view.ts";

describe("music stats formatting", () => {
  test("months read as words", () => {
    assert.equal(monthLabel("2024-08"), "Aug 2024");
    assert.equal(quarterLabel("2025-Q2"), "Q2 2025");
  });

  test("a month range drops what both ends share", () => {
    assert.equal(monthRange("2024-08", "2024-08"), "Aug 2024");
    assert.equal(monthRange("2024-08", "2024-12"), "Aug–Dec 2024");
    assert.equal(monthRange("2024-11", "2025-02"), "Nov 2024 – Feb 2025");
  });

  test("small shares keep a decimal so they don't all read 0%", () => {
    assert.equal(percent(0.1234), "12%");
    assert.equal(percent(0.003), "0.3%");
    assert.equal(percent(0), "0%");
  });
});

describe("album art renditions", () => {
  test("swaps the 640px prefix for the size drawn", () => {
    const url = "https://i.scdn.co/image/ab67616d0000b273abcdef";
    assert.equal(cover(url, 64), "https://i.scdn.co/image/ab67616d00004851abcdef");
    assert.equal(cover(url, 300), "https://i.scdn.co/image/ab67616d00001e02abcdef");
  });

  test("leaves an unrecognised URL alone", () => {
    assert.equal(cover("https://example.com/a.jpg", 64), "https://example.com/a.jpg");
    assert.equal(cover(null, 64), null);
  });
});

describe("chart geometry", () => {
  test("a line runs edge to edge with the baseline at the bottom", () => {
    assert.equal(linePath([0, 1, 0.5], 100, 50, 1), "M0.0 50.0 L50.0 0.0 L100.0 25.0");
    assert.equal(linePath([], 100, 50, 1), "");
  });

  test("heat is square-root scaled and clamped", () => {
    assert.equal(heatLevel(0, 1), 0);
    assert.equal(heatLevel(0.25, 1), 0.5);
    assert.equal(heatLevel(2, 1), 1);
    assert.equal(heatLevel(1, 0), 0);
  });

  test("share axes round up to the next 5%", () => {
    assert.ok(Math.abs(niceShareMax(0.084) - 0.1) < 1e-9);
    assert.equal(niceShareMax(0.01), 0.05);
  });

  test("profile helpers find the peak and wrap midnight", () => {
    const shares = Array.from({ length: 24 }, (_, h) => (h === 16 ? 0.2 : h < 2 ? 0.1 : 0));
    assert.equal(peakHour(shares), 16);
    assert.ok(Math.abs(shareBetween(shares, 22, 6) - 0.2) < 1e-9);
  });
});

describe("year switch", () => {
  test("offers every year from the first to the current one", () => {
    assert.deepEqual(statsYears(new Date("2026-10-11T00:00:00Z")), ["2020", "2021", "2022", "2023", "2024", "2025", "2026"]);
  });

  test("shows only the chosen year's panels, or all time when none is chosen", () => {
    const css = yearSwitchCss(["2024"]);
    assert.match(css, /html:not\(\[data-stats-year\]\) \[data-year\]:not\(\[data-year='all'\]\)\{display:none\}/);
    assert.match(css, /html\[data-stats-year='2024'\] \[data-year\]:not\(\[data-year='2024'\]\)\{display:none\}/);
  });
});
