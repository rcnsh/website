/** Deadline for every outbound fetch — see CLAUDE.md § Maintenance › Data. */
export const REQUEST_TIMEOUT_MS = 6_000;

/** An `AbortSignal` carrying the shared deadline. */
export function deadline(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

/** Throws unless ok, naming the upstream and status for the cache log. */
export function ensureOk(response: Response, what: string): Response {
  if (!response.ok) {
    throw new Error(`${what} responded ${response.status} ${response.statusText}`);
  }
  return response;
}
