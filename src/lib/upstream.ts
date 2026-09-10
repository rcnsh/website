/**
 * Shared rules for talking to something that is not us.
 *
 * Two things every outbound request on this site needs, and neither is the
 * default:
 *
 *  1. A deadline. `fetch` has no timeout of its own, so a hung upstream holds
 *     the request open until the platform gives up on it — which on a server
 *     island means a visitor watching a skeleton, and in the OAuth callback
 *     means a login that never resolves.
 *
 *  2. To fail loudly. `cached()` implements stale-while-revalidate by catching
 *     the loader's rejection and keeping what it already has. A loader that
 *     swallows its own error and returns `[]` defeats that entirely: the empty
 *     value looks like success, gets written to KV, and replaces good data for
 *     the whole freshness window. One blip then reads as "this person has no
 *     repositories" for half an hour.
 *
 * So loaders here throw, and `cached()` decides what the visitor sees.
 */

/**
 * A page render must not hang on a slow upstream. On timeout `cached()` falls
 * back to whatever it already holds, so a stall costs freshness, not the page.
 */
export const REQUEST_TIMEOUT_MS = 6_000;

/** An `AbortSignal` carrying the shared deadline. */
export function deadline(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

/**
 * Throws unless the response is ok, with the status in the message so the
 * cache log says which upstream failed and how.
 */
export function ensureOk(response: Response, what: string): Response {
  if (!response.ok) {
    throw new Error(`${what} responded ${response.status} ${response.statusText}`);
  }
  return response;
}
