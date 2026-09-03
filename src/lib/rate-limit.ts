/**
 * Guestbook rate limit: one message per signer per day. Rolling, not calendar,
 * so it has no timezone and nobody posts twice by waiting for midnight.
 */

/** Length of the window, in milliseconds. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * When the signer whose last message was posted at `lastPostedAt` may post
 * again, or `null` if they may post now. `null` for a first-time signer.
 */
export function nextAllowedAt(
  lastPostedAt: Date | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (!lastPostedAt) return null;

  const next = new Date(lastPostedAt.getTime() + WINDOW_MS);
  return next.getTime() > now.getTime() ? next : null;
}
