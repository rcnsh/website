import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  maxLength: number;
  initialMessage: string;
  isUpdate: boolean;
};

/**
 * Progressive enhancement: this is a normal <form method="POST"> that the page
 * handles server-side. React only adds the live counter and pending state.
 */
export default function GuestbookForm({
  maxLength,
  initialMessage,
  isUpdate,
}: Props) {
  const [message, setMessage] = useState(initialMessage);
  const [pending, setPending] = useState(false);

  const remaining = maxLength - message.length;
  const empty = message.trim().length === 0;
  const unchanged = message.trim() === initialMessage.trim();

  return (
    <form method="POST" onSubmit={() => setPending(true)}>
      <textarea
        name="message"
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
        rows={2}
        maxLength={maxLength}
        placeholder={isUpdate ? "Update your message…" : "Leave a message…"}
        aria-label="Your guestbook message"
        className="w-full resize-none border-b border-line bg-transparent py-2 text-[0.9375rem] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
      />

      <div className="mt-2.5 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || empty || unchanged}
          className="font-mono text-xs text-ink underline decoration-line-strong underline-offset-[4px] transition-colors hover:decoration-brand disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
        >
          {pending ? "signing…" : isUpdate ? "update" : "sign"}
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
