import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createCache, STALE_GRACE_SECONDS, type CacheStore } from "./swr.ts";

const SECOND = 1000;

/** A KV stand-in over a Map, with a clock the test moves and switchable failures. */
function harness() {
  let clock = 1_000_000;
  const data = new Map<string, string>();
  const ttls = new Map<string, number>();
  const background: Promise<unknown>[] = [];
  const fail = { get: false, put: false };

  const store: CacheStore = {
    async get(key) {
      if (fail.get) throw new Error("kv read down");
      const raw = data.get(key);
      return raw === undefined ? null : JSON.parse(raw);
    },
    async put(key, value, { expirationTtl }) {
      if (fail.put) throw new Error("kv write down");
      data.set(key, value);
      ttls.set(key, expirationTtl);
    },
    async delete(key) {
      data.delete(key);
    },
  };

  const cache = createCache({
    store: () => store,
    now: () => clock,
    waitUntil: (promise) => {
      background.push(promise);
    },
  });

  return {
    ...cache,
    data,
    ttls,
    fail,
    advance(seconds: number) {
      clock += seconds * SECOND;
    },
    /** Lets the background refreshes handed to waitUntil finish. */
    settle: () => Promise.all(background.splice(0)),
  };
}

/** A loader that counts its calls and returns whatever `next` holds. */
function counting<T>(first: T) {
  const state = {
    calls: 0,
    next: first as T | Error,
    load: async (): Promise<T> => {
      state.calls += 1;
      if (state.next instanceof Error) throw state.next;
      return state.next;
    },
  };
  return state;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("cached", () => {
  test("a fresh hit does not call the loader", async () => {
    const c = harness();
    const loader = counting("v1");

    assert.equal(await c.cached("fresh", 60, loader.load), "v1");
    c.advance(59);
    loader.next = "v2";
    assert.equal(await c.cached("fresh", 60, loader.load), "v1");
    assert.equal(loader.calls, 1);
  });

  test("a miss stores the value for freshFor plus the grace window", async () => {
    const c = harness();
    await c.cached("ttl", 60, async () => "v");
    assert.equal(c.ttls.get("ttl"), 60 + STALE_GRACE_SECONDS);
  });

  test("a stale hit returns the stale value and refreshes in the background", async () => {
    const c = harness();
    const loader = counting("v1");
    await c.cached("stale", 60, loader.load);

    c.advance(61);
    loader.next = "v2";
    assert.equal(await c.cached("stale", 60, loader.load), "v1");

    await c.settle();
    assert.equal(loader.calls, 2);
    assert.equal(await c.cached("stale", 60, loader.load), "v2");
    assert.equal(loader.calls, 2, "the refreshed entry is fresh again");
  });

  test("a failed background refresh keeps the stale entry", async () => {
    const c = harness();
    const loader = counting("v1");
    await c.cached("bg-fail", 60, loader.load);

    c.advance(61);
    loader.next = new Error("upstream down");
    assert.equal(await c.cached("bg-fail", 60, loader.load), "v1");
    await c.settle();
    assert.equal(JSON.parse(c.data.get("bg-fail") ?? "null").v, "v1");
  });

  test("a stale hit outside a request context still serves stale", async () => {
    const data = new Map<string, string>();
    const store: CacheStore = {
      get: async (key) => JSON.parse(data.get(key) ?? "null"),
      put: async (key, value) => {
        data.set(key, value);
      },
      delete: async (key) => {
        data.delete(key);
      },
    };
    let clock = 0;
    const { cached } = createCache({
      store: () => store,
      now: () => clock,
      waitUntil: () => {
        throw new Error("no request context");
      },
    });

    await cached("prerender", 60, async () => "v1");
    clock += 61 * SECOND;
    assert.equal(await cached("prerender", 60, async () => "v2"), "v1");
  });

  test("past maxStale the call blocks on the loader", async () => {
    const c = harness();
    const loader = counting("v1");
    await c.cached("expired", 60, loader.load, { maxStaleSeconds: 3600 });

    c.advance(3600);
    loader.next = "v2";
    assert.equal(await c.cached("expired", 60, loader.load, { maxStaleSeconds: 3600 }), "v2");
    assert.equal(JSON.parse(c.data.get("expired") ?? "null").v, "v2");
  });

  test("a loader rejection past maxStale falls back to the stale value", async () => {
    const c = harness();
    const loader = counting("v1");
    await c.cached("expired-fail", 60, loader.load, { maxStaleSeconds: 3600 });

    c.advance(7200);
    loader.next = new Error("upstream down");
    assert.equal(
      await c.cached("expired-fail", 60, loader.load, { maxStaleSeconds: 3600 }),
      "v1",
    );
  });

  test("a loader rejection with nothing stored throws", async () => {
    const c = harness();
    await assert.rejects(
      () => c.cached("cold-fail", 60, async () => { throw new Error("upstream down"); }),
      /upstream down/,
    );
  });

  test("a loader rejection beyond the stored entry's lifetime throws", async () => {
    const c = harness();
    await c.cached("gone", 60, async () => "v1");
    // KV evicts at expirationTtl; the fake does not, so evict by hand.
    c.advance(60 + STALE_GRACE_SECONDS);
    c.data.delete("gone");

    await assert.rejects(
      () => c.cached("gone", 60, async () => { throw new Error("upstream down"); }),
      /upstream down/,
    );
  });

  // "Loaders must throw" (CLAUDE.md) depends on this.
  test("a loader rejection is never written to the store", async () => {
    const c = harness();
    const loader = counting("v1");
    await c.cached("no-poison", 60, loader.load, { maxStaleSeconds: 120 });
    const stored = c.data.get("no-poison");

    loader.next = new Error("upstream down");
    c.advance(61);
    await c.cached("no-poison", 60, loader.load, { maxStaleSeconds: 120 });
    await c.settle();
    c.advance(120);
    await c.cached("no-poison", 60, loader.load, { maxStaleSeconds: 120 });

    assert.equal(c.data.get("no-poison"), stored);
    await assert.rejects(() => c.cached("cold-poison", 60, loader.load));
    assert.equal(c.data.has("cold-poison"), false);
  });

  test("a KV read error is treated as a miss", async () => {
    const c = harness();
    const loader = counting("v1");
    await c.cached("read-fail", 60, loader.load);

    c.fail.get = true;
    loader.next = "v2";
    assert.equal(await c.cached("read-fail", 60, loader.load), "v2");
    assert.equal(loader.calls, 2);
  });

  test("a KV write error does not fail the request", async () => {
    const c = harness();
    c.fail.put = true;
    assert.equal(await c.cached("write-fail", 60, async () => "v"), "v");
    assert.equal(c.data.has("write-fail"), false);
  });

  test("concurrent calls for one key share a load", async () => {
    const c = harness();
    const gate = deferred<string>();
    let calls = 0;
    const load = () => {
      calls += 1;
      return gate.promise;
    };

    const pending = [c.cached("herd", 60, load), c.cached("herd", 60, load)];
    // Both calls are past their KV read before the loader settles.
    await new Promise((resolve) => setImmediate(resolve));
    gate.resolve("v");

    assert.deepEqual(await Promise.all(pending), ["v", "v"]);
    assert.equal(calls, 1);
  });

  test("with no store bound, every call loads", async () => {
    const { cached } = createCache({
      store: () => undefined,
      now: () => 0,
      waitUntil: () => {},
    });
    const loader = counting("v");
    await cached("unbound", 60, loader.load);
    await cached("unbound", 60, loader.load);
    assert.equal(loader.calls, 2);
  });
});

describe("invalidate", () => {
  test("removes the entry, so the next read loads", async () => {
    const c = harness();
    const loader = counting("v1");
    await c.cached("a", 60, loader.load);
    await c.cached("b", 60, loader.load);

    await c.invalidate("a", "b");
    assert.equal(c.data.size, 0);

    loader.next = "v2";
    assert.equal(await c.cached("a", 60, loader.load), "v2");
  });

  test("a KV delete error is swallowed", async () => {
    const { invalidate } = createCache({
      store: () => ({
        get: async () => null,
        put: async () => {},
        delete: async () => {
          throw new Error("kv down");
        },
      }),
      now: () => 0,
      waitUntil: () => {},
    });
    await invalidate("k");
  });
});
