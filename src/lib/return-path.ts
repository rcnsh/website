export const DEFAULT_RETURN_PATH = "/guestbook";

export function returnPath(value: string | null | undefined): string {
  if (!value || !/^\/[A-Za-z0-9/_-]*$/.test(value) || value.startsWith("//")) {
    return DEFAULT_RETURN_PATH;
  }
  return value;
}
