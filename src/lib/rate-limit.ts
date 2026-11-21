export const WINDOW_MS = 24 * 60 * 60 * 1000;

export function nextAllowedAt(
  lastPostedAt: Date | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (!lastPostedAt) return null;

  const next = new Date(lastPostedAt.getTime() + WINDOW_MS);
  return next.getTime() > now.getTime() ? next : null;
}
