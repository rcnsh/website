import { useEffect, useState } from "react";
import { GithubIcon } from "@/components/react/BrandIcons";
import type { SignerView } from "@/lib/guestbook-signer";
import { relativeTime } from "@/lib/utils";
import GuestbookForm from "./GuestbookForm";
import { useSigner } from "./useSigner";

type Props = { maxLength: number };

/** What /api/guestbook/sign and the auth callback redirect back with. */
function errorText(code: string, maxLength: number): string | null {
  switch (code) {
    case "state":
      return "That login attempt expired. Give it another go.";
    case "auth":
      return "Sign in with GitHub first.";
    case "signin":
      return "GitHub sign-in didn't go through. Give it another go.";
    case "empty":
      return "Write something before signing.";
    case "long":
      return `Keep it under ${maxLength} characters.`;
    case "profanity":
      return "Let's keep it friendly.";
    case "rate":
      return "One message a day — you've already had yours.";
    case "db":
      return "Couldn't save that. Try again in a moment.";
    default:
      return null;
  }
}

type Status = { error: string | null; posted: boolean };

/**
 * The sign tile's body. The page is prerendered for everyone, so who is
 * reading, and the outcome of their last post, are both known only here.
 */
export default function GuestbookSign({ maxLength }: Props) {
  const view = useSigner();
  const [status, setStatus] = useState<Status>({ error: null, posted: false });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setStatus({ error: params.get("error"), posted: params.has("posted") });
  }, []);

  const error = status.error ? errorText(status.error, maxLength) : null;

  return (
    <>
      <Body view={view} maxLength={maxLength} restoreDraft={Boolean(status.error)} />
      <div role="status">
        {error && <p className="mt-3 text-[0.84375rem] text-bad">{error}</p>}
        {status.posted && !status.error && (
          <p className="mt-3 text-[0.84375rem] text-ok">Signed — thanks.</p>
        )}
      </div>
    </>
  );
}

function Body({
  view,
  maxLength,
  restoreDraft,
}: {
  view: SignerView | "failed" | null;
  maxLength: number;
  restoreDraft: boolean;
}) {
  if (view === null) {
    // The signed-out prompt's footprint, the commoner answer.
    return (
      <div className="flex flex-1 flex-col justify-center gap-3.5" aria-hidden="true">
        <div className="placeholder-block h-10 w-[19rem] max-w-full rounded-[6px]" />
        <div className="placeholder-block h-[2.5rem] w-full max-w-[58ch] rounded-xs" />
      </div>
    );
  }

  if (view === "failed") {
    return (
      <p className="flex flex-1 items-center text-sm text-ink-faint">
        Couldn't check whether you're signed in. Reload to try again.
      </p>
    );
  }

  const { signer, nextPostAt } = view;
  if (!signer) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-3.5">
        {/* Not prefetched: the route mints an OAuth state cookie on every GET. */}
        <a
          href="/api/auth/login"
          data-astro-prefetch="false"
          className="inline-flex items-center gap-2 self-start rounded-[6px] border border-ink bg-ink px-3.5 py-2.5 text-[0.90625rem] leading-[1.3] font-medium text-(color:--color-base) press hover:bg-white sm:h-10 sm:px-4 sm:py-0"
        >
          <GithubIcon className="h-4 w-4 shrink-0" />
          Sign in with GitHub to leave a message
        </a>
        <p className="max-w-[58ch] text-[0.8125rem] leading-[1.55] text-ink-faint">
          Signing in stores your GitHub username, avatar, and approximate country with your
          message, shown publicly below. You can delete your own entry any time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3">
        {signer.avatarUrl ? (
          <img
            src={signer.avatarUrl}
            alt=""
            width={30}
            height={30}
            className="h-[30px] w-[30px] shrink-0 rounded-full"
          />
        ) : (
          <span className="h-[30px] w-[30px] shrink-0 rounded-full bg-raised" />
        )}
        <p className="min-w-0 truncate font-mono text-[12.5px] text-ink-dim">@{signer.username}</p>
        {/* A full load, not the router's: signing out must reset everything
            the document holds for the owner (the player, data-owner). */}
        <form method="POST" action="/api/auth/logout" data-astro-reload className="ml-auto">
          <button
            type="submit"
            className="-my-2 py-2 font-mono text-xs text-ink-faint underline decoration-line-strong underline-offset-[3px] transition-colors hover:text-ink-dim hover:decoration-brand"
          >
            sign out
          </button>
        </form>
      </div>

      {nextPostAt ? (
        <p className="mt-4 flex flex-1 items-center gap-2.5 text-sm text-ink-dim">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-soft text-ok"
            aria-hidden="true"
          >
            ✓
          </span>
          <span>
            One message a day. You can sign again{" "}
            <time dateTime={new Date(nextPostAt).toISOString()}>{relativeTime(new Date(nextPostAt))}</time>.
          </span>
        </p>
      ) : (
        <GuestbookForm maxLength={maxLength} restoreDraft={restoreDraft} />
      )}
    </div>
  );
}
