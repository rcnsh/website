/**
 * The pages rendered per request (`prerender = false`, .astro only). They
 * carry no <ClientRouter />, so the router would fetch one, find that,
 * discard it and load it again; `page-lifecycle.ts` sends links to these
 * straight to a full load instead. server-pages.test.ts keeps the list in
 * step with src/pages.
 */
export const SERVER_PAGES: readonly string[] = ["/blog/edit", "/guestbook"];

/** A file rather than a page: `/rss.xml`, `/now.svg`. Pages have no extension. */
const FILE = /\.[a-z0-9]+$/i;

/**
 * Whether a soft navigation to `pathname` would only end in a full load: the
 * router would fetch a file, find it is not HTML and load it again too.
 */
export function needsFullLoad(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    SERVER_PAGES.includes(pathname) ||
    (FILE.test(pathname) && !pathname.endsWith(".html"))
  );
}
