import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { coalesce, inFlightCount } from "./coalesce.ts";

/** A promise plus the handles to settle it from the outside. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("single-flight", () => {
  test("concurrent callers for one key run the loader once", async () => {
    const gate = deferred<string>();
    let calls = 0;

    const load = () => {
      calls += 1;
      return gate.promise;
    };

    const a = coalesce("k", load);
    const b = coalesce("k", load);
    const c = coalesce("k", load);

    gate.resolve("value");
    assert.deepEqual(await Promise.all([a, b, c]), ["value", "value", "value"]);
    assert.equal(calls, 1, "the herd should collapse onto one load");
  });

  test("different keys do not share a load", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return calls;
    };

    await Promise.all([coalesce("one", load), coalesce("two", load)]);
    assert.equal(calls, 2);
  });

  /*
    The hazard the whole design turns on. If a rejected promise stayed in the
    map, one upstream blip would be replayed to every later caller for the
    lifetime of the isolate — a failure that outlives its own cause, and the
    single worst way for a cache to break.
  */
  test("a rejection does not poison the key", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      if (calls === 1) throw new Error("upstream down");
      return "recovered";
    };

    await assert.rejects(() => coalesce("flaky", load), /upstream down/);
    assert.equal(await coalesce("flaky", load), "recovered");
    assert.equal(calls, 2, "the second call must actually re-run the loader");
  });

  test("callers joined to a failing load all see the failure", async () => {
    const gate = deferred<string>();
    const load = () => gate.promise;

    const a = coalesce("shared-failure", load);
    const b = coalesce("shared-failure", load);

    gate.reject(new Error("boom"));
    await assert.rejects(() => a, /boom/);
    await assert.rejects(() => b, /boom/);
  });

  test("the map does not leak once loads settle", async () => {
    await coalesce("settled", async () => "ok");
    await assert.rejects(
      () => coalesce("settled", async () => { throw new Error("x"); }),
      /x/,
    );
    assert.equal(inFlightCount(), 0, "every settled load must be evicted");
  });
});
