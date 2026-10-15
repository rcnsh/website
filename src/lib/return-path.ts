/**
 * Where sign-in may send the visitor afterwards. Same-origin paths only:
 * anything else would make /api/auth/login an open redirect.
 */
export const DEFAULT_RETURN_PATH = "/guestbook";

export function returnPath(value: string | null | undefined): string {
  if (!value || !/^\/[A-Za-z0-9/_-]*$/.test(value) || value.startsWith("//")) {
    return DEFAULT_RETURN_PATH;
  }
  return value;
}
