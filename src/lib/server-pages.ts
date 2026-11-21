export const SERVER_PAGES: readonly string[] = ["/blog/edit"];

const FILE = /\.[a-z0-9]+$/i;

export function needsFullLoad(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    SERVER_PAGES.includes(pathname) ||
    (FILE.test(pathname) && !pathname.endsWith(".html"))
  );
}
