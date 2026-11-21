import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ERA_STYLE,
  cover,
  eraStyle,
  heatLevel,
  linePath,
  monthLabel,
  monthRange,
  niceShareMax,
  ordinal,
  peakHour,
  percent,
  quarterLabel,
  newYears,
  skeletonMatches,
  statsYears,
  shareBetween,
  spotifyUrl,
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

  test("adds years the islands render that the build did not know", () => {
    const offered = statsYears(new Date("2026-10-11T00:00:00Z"));
    assert.deepEqual(newYears(offered, ["all", "2025", "2027", "2026", "2027", "2028"]), ["2027", "2028"]);
  });

  test("adds nothing for years already offered or values that are not years", () => {
    const offered = statsYears(new Date("2026-10-11T00:00:00Z"));
    assert.deepEqual(newYears(offered, ["all", "2024", "2026", "", "2027-Q1", "27", "2019"]), []);
  });

  test("a year newer than the build matches the skeletons built for the latest year", () => {
    const live = ["2020", "2021", "2026"];
    const past = ["2020", "2025"];
    assert.equal(skeletonMatches(live, "2027", "2026"), true);
    assert.equal(skeletonMatches(past, "2027", "2026"), false);
    assert.equal(skeletonMatches(past, "2025", "2026"), true);
    assert.equal(skeletonMatches(["all"], "2027", "2026"), false);
  });

});

describe("song and artist links", () => {
  test("ordinals read as words do", () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111, 1002].map(ordinal), [
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th", "1,002nd",
    ]);
  });

  test("only real ids become Spotify links", () => {
    assert.equal(spotifyUrl("track", "6PCUP3dWmTjcTtXY02oFdT"), "https://open.spotify.com/track/6PCUP3dWmTjcTtXY02oFdT");
    assert.equal(spotifyUrl("artist", "name:Some Export Artist"), null);
    assert.equal(spotifyUrl("artist", null), null);
    assert.equal(spotifyUrl("track", undefined), null);
  });
});

describe("era palette", () => {
  test("each era has its own colour, and Singapore is dashed", () => {
    assert.notEqual(ERA_STYLE.newcastle.colour, ERA_STYLE.singapore.colour);
    assert.equal(ERA_STYLE.newcastle.dash, undefined);
    assert.ok(ERA_STYLE.singapore.dash);
  });

  test("an unknown era falls back to a neutral line", () => {
    assert.deepEqual(eraStyle("singapore"), ERA_STYLE.singapore);
    assert.equal(eraStyle("toString").colour, "var(--color-ink-dim)");
  });

  test("Eras and TimeOfDayPanel both read it", () => {
    for (const name of ["Eras.astro", "TimeOfDayPanel.astro"]) {
      const source = readFileSync(new URL(`../components/music/stats/${name}`, import.meta.url), "utf8");
      assert.match(source, /import \{[^}]*\b(ERA_STYLE|eraStyle)\b[^}]*\} from "@\/lib\/music-stats-view"/, name);
      for (const era of Object.values(ERA_STYLE)) assert.ok(!source.includes(era.colour), `${name} repeats ${era.colour}`);
    }
  });
});
