// Extracted from lib/cache so it can be tested: cache.ts imports from
// `cloudflare:workers`, which does not load under `node --test`.

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Runs `loader`, or joins the run already in progress for `key`. Isolate-scoped,
 * which is where a thundering herd forms.
 *
 * The entry must be dropped on both settle paths — see CLAUDE.md § Maintenance.
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
