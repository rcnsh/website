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
        className="w-full resize-none border-b border-line bg-transparent py-2 text-[0.9375rem] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
      />

      <div className="mt-2.5 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || empty}
          className="font-mono text-xs text-ink underline decoration-line-strong underline-offset-[4px] transition-colors hover:decoration-brand disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
        >
          {pending ? "signing…" : "sign"}
        </button>

        <span
          className={cn(
            "ml-auto font-mono text-[11px] tabular-nums",
            remaining <= 20 ? "text-amber-400/80" : "text-ink-faint",
          )}
        >
          {remaining}
        </span>
      </div>
    </form>
  );
}
