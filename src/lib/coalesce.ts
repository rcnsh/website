/*
  Single-flight: collapse concurrent calls for the same key onto one promise.

  Extracted from lib/cache so it can be tested — cache.ts imports from
  `cloudflare:workers`, which does not load under `node --test`, and the
  failure mode here is subtle enough to be worth asserting rather than
  reasoning about.
*/

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Runs `loader`, or joins the run already in progress for `key`.
 *
 * Scoped to the isolate, which is the level that matters: a burst of
 * concurrent requests in one Cloudflare location is usually one isolate, and
 * that is where a thundering herd forms. Without this a cold key lets every
 * concurrent reader run the loader — N full bucket scans, or N calls against a
 * rate-limited token, for one value they will all share.
 *
 * The entry is dropped as soon as the promise settles, on both paths. That is
 * load-bearing: retaining a rejected promise would replay one upstream failure
 * to every later caller for the isolate's lifetime, turning a blip into an
 * outage that outlives its cause.
 */
export function coalesce<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const run = loader().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, run);
  return run;
}

/** In-flight loads right now. Tests only. */
export function inFlightCount(): number {
  return inFlight.size;
}
