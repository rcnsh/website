import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MOTION_BOOTSTRAP } from "../../shared/inline-scripts.ts";
import { REDUCED_MOTION_QUERY, resolveMotion } from "../../shared/motion.ts";
import { applyMotion, motionReduced } from "./prefs.ts";

const STORED = [null, "reduce", "full", "", "garbage", "throws"] as const;

function environment(stored: (typeof STORED)[number], prefersReduce: boolean) {
  const dataset: Record<string, string> = {};
  const globals = {
    localStorage: {
      getItem(key: string) {
        if (stored === "throws") throw new DOMException("blocked", "SecurityError");
        return key === "rcn:motion" ? stored : null;
      },
    },
    matchMedia(query: string) {
      return { matches: query === "(prefers-reduced-motion: reduce)" && prefersReduce };
    },
    document: { documentElement: { dataset } },
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  return dataset;
}

function expected(stored: (typeof STORED)[number], prefersReduce: boolean) {
  if (stored === "reduce") return "reduce";
  if (stored === "full") return "full";
  return prefersReduce ? "reduce" : "full";
}

describe("motion preference", () => {
  test("the bootstrap inlines the query prefs.ts listens on", () => {
    assert.ok(MOTION_BOOTSTRAP.includes(JSON.stringify(REDUCED_MOTION_QUERY)));
  });

  for (const stored of STORED) {
    for (const prefersReduce of [false, true]) {
      test(`stored ${stored}, OS reduce ${prefersReduce}: bootstrap and prefs agree`, () => {
        const dataset = environment(stored, prefersReduce);
        new Function(MOTION_BOOTSTRAP)();
        const want = expected(stored, prefersReduce);
        assert.equal(dataset.motion, want);
        assert.equal(motionReduced() ? "reduce" : "full", want);
        assert.equal(resolveMotion(stored === "throws" ? null : stored, prefersReduce), want);
        delete dataset.motion;
        applyMotion();
        assert.equal(dataset.motion, want);
      });
    }
  }
});
