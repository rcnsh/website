import { useCallback, useEffect, useRef, useState } from "react";
import type { GuestbookEntry } from "@/lib/guestbook";
import { useSigner } from "./useSigner";
import { cn, relativeTime } from "@/lib/utils";

type Props = {
  initial: GuestbookEntry[];
  initialCursor: string | null;
};

type Page = { entries: GuestbookEntry[]; next: string | null; error?: boolean };

export default function GuestbookList({ initial, initialCursor }: Props) {
  const [entries, setEntries] = useState(initial);
  const signer = useSigner();
  const signerId = signer && signer !== "failed" ? (signer.signer?.githubId ?? null) : null;
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const sentinel = useRef<HTMLDivElement | null>(null);

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

      setEntries((current) => {
        const seen = new Set(current.map((entry) => entry.id));
        return [...current, ...page.entries.filter((entry) => !seen.has(entry.id))];
      });

      cursorRef.current = page.next;
      setCursor(page.next);
    } catch {
      setFailed(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-observing on each cursor fires again while the sentinel stays in the margin
  useEffect(() => {
    const target = sentinel.current;
    if (!target) return;

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
      <p className="py-2 text-sm text-ink-faint">
        No one's signed yet. Be the first.
      </p>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3">
        {entries.map((entry) => {
          const posted = new Date(entry.createdAt * 1000);
          const mine = signerId !== null && signerId === entry.githubId;

          return (
            <li
              key={entry.id}
              className={cn(
                "flex flex-col rounded-card border bg-[color-mix(in_oklab,var(--color-base)_50%,var(--color-surface))] px-4 pt-4 pb-3.5 transition-colors hover:border-line",
                mine
                  ? "border-[color-mix(in_oklab,var(--color-brand)_45%,var(--color-line-soft))]"
                  : "border-line-soft",
              )}
            >
              <p className="break-words text-[0.9375rem] leading-relaxed text-ink [overflow-wrap:anywhere]">
                {entry.message}
              </p>

              <div className="mt-auto flex min-w-0 items-center gap-2 pt-3.5 font-mono text-[11px] text-ink-faint">
                {entry.avatarUrl ? (
                  <img
                    src={entry.avatarUrl}
                    alt=""
                    width={20}
                    height={20}
                    loading="lazy"
                    className="h-5 w-5 shrink-0 rounded-full"
                  />
                ) : (
                  <span className="h-5 w-5 shrink-0 rounded-full bg-raised" />
                )}
                <a
                  href={`https://github.com/${entry.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate transition-colors hover:text-ink-dim"
                >
                  @{entry.username}
                </a>
                <span aria-hidden="true">·</span>
                <time dateTime={posted.toISOString()} className="shrink-0">
                  {relativeTime(posted)}
                </time>
                {mine && (
                  <form
                    method="POST"
                    action="/api/guestbook/delete"
                    className="ml-auto shrink-0"
                  >
                    <input type="hidden" name="id" value={entry.id} />
                    <button
                      type="submit"
                      className="text-ink-faint underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-bad hover:decoration-bad"
                    >
                      delete
                    </button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {cursor && (
        <div ref={sentinel} className="pt-4 text-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            aria-live="polite"
            className="-my-2 py-2 font-mono text-xs text-ink-faint underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-ink-dim hover:decoration-brand disabled:no-underline"
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
