import { useCallback, useEffect, useRef, useState } from "react";
import type { GuestbookEntry } from "@/lib/guestbook";
import { relativeTime } from "@/lib/utils";

/**
 * The signature list, loaded a page at a time as the reader scrolls.
 *
 * The whole list used to be rendered on the server, 200 rows of it, on every
 * request. Almost nobody reached the bottom and everybody paid for it — see
 * lib/guestbook.ts for why that was worse than merely wasteful.
 *
 * The first page still arrives in the HTML: this is a server-rendered island,
 * so the entries below are in the document before React runs, and a reader
 * with no JavaScript gets them too. What JavaScript adds is the rest of the
 * list. That is the right way round — the fallback is a short guestbook, not
 * an empty one.
 */

type Props = {
  /** The first page, rendered on the server. */
  initial: GuestbookEntry[];
  /** Cursor for the page after `initial`, or null if that was all of them. */
  initialCursor: string | null;
  /** The signed-in reader, so their own entries get a delete control. */
  sessionGithubId: number | null;
};

type Page = { entries: GuestbookEntry[]; next: string | null; error?: boolean };

export default function GuestbookList({
  initial,
  initialCursor,
  sessionGithubId,
}: Props) {
  const [entries, setEntries] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const sentinel = useRef<HTMLDivElement | null>(null);

  /*
    Held in refs as well as in state because the observer callback below is
    registered against a DOM node, not re-created per render, and a callback
    closed over the first render's cursor would ask for page two on every
    scroll for the rest of the session.
  */
  const cursorRef = useRef(initialCursor);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    const after = cursorRef.current;
    if (!after || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setFailed(false);

    try {
      const response = await fetch(
        `/api/guestbook/list?after=${encodeURIComponent(after)}`,
      );
      const page = (await response.json()) as Page;

      if (page.error || !Array.isArray(page.entries)) {
        setFailed(true);
        return;
      }

      /*
        The cursor moves strictly backwards, so a page cannot overlap the one
        before it. The filter covers the case the cursor cannot: an entry
        deleted between two fetches shifts the window, and a row already on
        screen could arrive a second time.
      */
      setEntries((current) => {
        const seen = new Set(current.map((entry) => entry.id));
        return [...current, ...page.entries.filter((entry) => !seen.has(entry.id))];
      });

      cursorRef.current = page.next;
      setCursor(page.next);
    } catch {
      // Offline, or the request was cut short. The sentinel stays where it is,
      // so scrolling past it again retries.
      setFailed(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  /*
    `cursor` is load-bearing in the dependency list, not over-specified.

    An IntersectionObserver reports transitions, not states. On a tall screen
    the sentinel is often still inside the root margin once a page has been
    appended — nothing crossed a boundary, so nothing fires again, and the list
    stops one page in until the reader scrolls away and back. Rebuilding the
    observer on each new cursor re-observes the element, which reports the
    current intersection immediately and fetches the next page while the
    sentinel is still on screen.
  */
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const target = sentinel.current;
    if (!target) return;

    /*
      A margin rather than a bare intersection: the next page starts loading
      while the end of this one is still a screen away, so the list usually
      grows before the reader arrives at the bottom of it.
    */
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, cursor]);

  if (entries.length === 0) {
    return (
      <p className="py-6 text-sm text-ink-faint">
        No one's signed yet. Be the first.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-line border-y border-line">
        {entries.map((entry) => {
          const posted = new Date(entry.createdAt * 1000);

          return (
            <li key={entry.id} className="flex gap-3.5 py-4">
              {entry.avatarUrl ? (
                <img
                  src={entry.avatarUrl}
                  alt=""
                  width={28}
                  height={28}
                  loading="lazy"
                  className="mt-0.5 h-7 w-7 shrink-0 rounded-full"
                />
              ) : (
                <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-raised" />
              )}

              <div className="min-w-0 flex-1">
                <p className="break-words text-[0.9375rem] leading-relaxed text-ink">
                  {entry.message}
                </p>
                <p className="mt-1.5 font-mono text-[11px] text-ink-faint">
                  <a
                    href={`https://github.com/${entry.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors hover:text-ink-dim"
                  >
                    @{entry.username}
                  </a>
                  {" · "}
                  <time dateTime={posted.toISOString()}>
                    {relativeTime(posted)}
                  </time>
                  {sessionGithubId !== null &&
                    sessionGithubId === entry.githubId && (
                      <>
                        {" · "}
                        <form
                          method="POST"
                          action="/api/guestbook/delete"
                          className="inline"
                        >
                          <input type="hidden" name="id" value={entry.id} />
                          <button
                            type="submit"
                            className="text-ink-faint underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-red-400/90"
                          >
                            delete
                          </button>
                        </form>
                      </>
                    )}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {cursor && (
        /*
          A real button, not a bare sentinel.

          Scrolling is how this is meant to be used and the observer above is
          what makes that happen, but an element that only responds to being
          scrolled past is unreachable from the keyboard and has no recourse if
          the observer does not fire — a hidden tab, a browser that throttles
          it, reduced-data mode. The button is the same action with a handle on
          it: the observer presses it for you, and you can press it yourself.

          aria-live so a screen reader is told the list grew rather than being
          walked silently past the end of what it had.
        */
        <div ref={sentinel} className="pt-5 text-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            aria-live="polite"
            className="font-mono text-xs text-ink-faint underline decoration-line-strong underline-offset-[4px] transition-colors hover:text-ink-dim hover:decoration-brand disabled:no-underline"
          >
            {loading
              ? "loading…"
              : failed
                ? "couldn't load more — retry"
                : "load more"}
          </button>
        </div>
      )}
    </>
  );
}
