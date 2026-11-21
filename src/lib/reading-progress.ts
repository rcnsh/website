export function activeHeading(
  tops: readonly number[],
  threshold: number,
  atEnd = false,
): number {
  if (atEnd && tops.length > 0) return tops.length - 1;
  let active = -1;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= threshold) active = i;
    else break;
  }
  return active;
}

export function readingProgress(top: number, height: number, viewport: number): number {
  const travel = height - viewport;
  if (travel <= 0) return top <= 0 ? 1 : 0;
  return Math.max(0, Math.min(1, -top / travel));
}
