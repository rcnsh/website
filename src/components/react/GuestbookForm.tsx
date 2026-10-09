import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  maxLength: number;
  /** The last submit was refused, so put the reader's text back. */
  restoreDraft: boolean;
};

/** Survives the post/redirect/get round trip, which re-renders an empty form. */
const DRAFT_KEY = "guestbook:draft";

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Progressive enhancement: this is a normal <form method="POST"> that the page
 * handles server-side. React only adds the live counter and pending state.
 */
export default function GuestbookForm({ maxLength, restoreDraft }: Props) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const store = storage();
    const draft = store?.getItem(DRAFT_KEY);
    store?.removeItem(DRAFT_KEY);
    if (restoreDraft && draft) setMessage(draft.slice(0, maxLength));

    // Back from the POST restores this page from bfcache with the button stuck.
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, [restoreDraft, maxLength]);

  const remaining = maxLength - message.length;
  const empty = message.trim().length === 0;

  return (
    <form
      method="POST"
      className="mt-4 flex flex-1 flex-col"
      onSubmit={() => {
        try {
          storage()?.setItem(DRAFT_KEY, message);
        } catch {
          // Quota or privacy mode; the post still goes through.
        }
        setPending(true);
      }}
    >
      <textarea
        name="message"
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
        rows={2}
        maxLength={maxLength}
        placeholder="Leave a message…"
        aria-label="Your guestbook message"
        aria-describedby="gb-remaining"
        className="min-h-[92px] w-full flex-1 resize-none rounded-[6px] border border-line-soft bg-base px-3.5 py-3 text-[0.9375rem] leading-[1.55] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
      />

      <div className="mt-3 flex items-center gap-3.5">
        <button
          type="submit"
          disabled={pending || empty}
          className="inline-flex h-[34px] shrink-0 items-center rounded-[6px] border border-ink bg-ink px-3.5 text-[0.84375rem] font-medium text-(color:--color-base) transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-ink"
        >
          {pending ? "Signing…" : "Sign"}
        </button>

        <span className="hidden min-w-0 truncate font-mono text-[11px] text-ink-faint sm:inline">
          Shown with your avatar and country
        </span>

        <span
          id="gb-remaining"
          className={cn(
            "ml-auto font-mono text-[11px] tabular-nums",
            remaining <= 20 ? "text-warn" : "text-ink-faint",
          )}
        >
          <span className="sr-only">Characters left: </span>
          {remaining}
        </span>
      </div>
    </form>
  );
}
