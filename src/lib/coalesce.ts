const inFlight = new Map<string, Promise<unknown>>();

export function coalesce<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const run = loader().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, run);
  return run;
}

export function inFlightCount(): number {
  return inFlight.size;
}
