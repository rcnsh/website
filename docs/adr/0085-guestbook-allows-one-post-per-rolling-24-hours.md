# 0085. A signer may post once per rolling 24 hours, enforced when signing

A signer may post one guestbook message per rolling 24 hours (`WINDOW_MS` in `src/lib/rate-limit.ts`). `nextAllowedAt` takes the signer's last post time and returns when they may post next, or null if they may post now. The window is rolling rather than calendar, so it has no timezone and nobody posts twice by waiting for midnight.

`/api/guestbook/sign` re-checks the limit against `lastPostedAt` at post time and refuses with `?error=rate` while it is non-null, because the form may have been open from before the signer's last message.

`/api/guestbook/signer` reports it as `nextPostAt` so the form can say when. If that lookup fails, the route logs it and reports no limit: signing re-checks it, so the limit still holds.
