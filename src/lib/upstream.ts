export const REQUEST_TIMEOUT_MS = 6_000;

export function deadline(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

export function ensureOk(response: Response, what: string): Response {
  if (!response.ok) {
    throw new Error(`${what} responded ${response.status} ${response.statusText}`);
  }
  return response;
}
