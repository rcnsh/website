import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createEdgeCache, type EdgeCache } from "./edge-cache.ts";

const URL_ = "https://rcn.sh/api/thing?q=x";
const POLICY = "public, max-age=60";

/** One colo's caches over Maps, storing what a real cache would: an immutable copy. */
function harness() {
  const stores = new Map<string, Map<string, Response>>();
  const background: Promise<unknown>[] = [];

  const open = async (name: string): Promise<EdgeCache> => {
    const entries = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, entries);
    return {
      async match(key) {
        const stored = entries.get(key.url);
        if (!stored) return undefined;
        // What the Cache API hands back: headers that throw when written.
        const hit = stored.clone();
        Object.defineProperty(hit, "headers", { value: new Headers(stored.headers) });
        for (const method of ["set", "append", "delete"] as const) {
          hit.headers[method] = () => {
            throw new TypeError("immutable");
          };
        }
        return hit;
      },
      async put(key, response) {
        entries.set(key.url, response);
      },
      async delete(key) {
        return entries.delete(key.url);
      },
    };
  };

  const edge = createEdgeCache({ open, waitUntil: (promise) => void background.push(promise) });
  return {
    ...edge,
    stores,
    pending: () => background.length,
    settle: () => Promise.all(background.splice(0)),
  };
}

const body = (value: unknown) => async () =>
  new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });

describe("edgeCached", () => {
  test("a miss answers at once and stores in the background, without browser-only headers", async () => {
    const h = harness();
    const response = await h.edgeCached("things", URL_, body({ n: 1 }), { policy: POLICY, headers: { vary: "cookie" } });

    assert.equal(response.headers.get("cache-control"), POLICY);
    assert.equal(response.headers.get("vary"), "cookie");
    assert.equal(h.pending(), 1, "the put is handed to waitUntil, not awaited");

    await h.settle();
    const stored = h.stores.get("things")?.get(URL_);
    assert.ok(stored);
    assert.equal(stored.headers.get("cache-control"), POLICY);
    assert.equal(stored.headers.has("vary"), false);
    assert.deepEqual(await response.json(), { n: 1 });
  });

  test("a hit is a mutable response with the policy's headers, and nothing is produced", async () => {
    const h = harness();
    await h.edgeCached("things", URL_, body({ n: 1 }), { policy: POLICY });
    await h.settle();

    let produced = 0;
    const hit = await h.edgeCached(
      "things",
      URL_,
      async () => {
        produced++;
        return new Response("{}");
      },
      { policy: POLICY, headers: { vary: "cookie" } },
    );

    assert.equal(produced, 0);
    assert.equal(hit.headers.get("cache-control"), POLICY);
    assert.equal(hit.headers.get("vary"), "cookie");
    assert.doesNotThrow(() => hit.headers.set("x-frame-options", "DENY"));
    assert.deepEqual(await hit.json(), { n: 1 });
  });

  test("fromHit shapes the answer from a hit", async () => {
    const h = harness();
    await h.edgeCached("things", URL_, body({ n: 1 }), { policy: POLICY });
    await h.settle();

    const hit = await h.edgeCached("things", URL_, body({ n: 2 }), {
      policy: POLICY,
      fromHit: async (cached) => new Response(JSON.stringify({ n: ((await cached.json()) as { n: number }).n + 10 })),
    });
    assert.deepEqual(await hit.json(), { n: 11 });
    assert.equal(hit.headers.get("cache-control"), POLICY);
  });

  test("a rejection propagates and nothing is stored", async () => {
    const h = harness();
    await assert.rejects(
      h.edgeCached(
        "things",
        URL_,
        async () => {
          throw new Error("upstream down");
        },
        { policy: POLICY },
      ),
      /upstream down/,
    );
    await h.settle();
    assert.equal(h.stores.get("things")?.size, 0);
  });

  test("a non-2xx answer is returned uncacheable and not stored", async () => {
    const h = harness();
    const response = await h.edgeCached("things", URL_, async () => new Response("{}", { status: 502 }), {
      policy: POLICY,
    });
    await h.settle();
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(h.stores.get("things")?.size, 0);
  });

  test("caches are kept apart by name", async () => {
    const h = harness();
    await h.edgeCached("a", URL_, body({ from: "a" }), { policy: POLICY });
    await h.settle();
    const other = await h.edgeCached("b", URL_, body({ from: "b" }), { policy: POLICY });
    assert.deepEqual(await other.json(), { from: "b" });
  });
});

describe("invalidateEdge", () => {
  test("deletes the entry, so the next read produces again", async () => {
    const h = harness();
    await h.edgeCached("things", URL_, body({ n: 1 }), { policy: POLICY });
    await h.settle();

    assert.equal(await h.invalidateEdge("things", URL_), true);
    assert.equal(h.stores.get("things")?.has(URL_), false);
    const fresh = await h.edgeCached("things", URL_, body({ n: 2 }), { policy: POLICY });
    assert.deepEqual(await fresh.json(), { n: 2 });
  });

  test("swallows a failing cache", async () => {
    const { invalidateEdge } = createEdgeCache({
      open: async () => {
        throw new Error("cache down");
      },
      waitUntil: () => {},
    });
    assert.equal(await invalidateEdge("things", URL_), false);
  });
});
