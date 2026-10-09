export type RankedCountry = {
  code: string;
  count: number;
  /** Relative to the busiest country, 0–1, for the bar. */
  share: number;
};

/**
 * The guestbook's per-country totals, busiest first, split into the rows the
 * ranking draws and the tail it folds into one line. Ties break on code so
 * the order is stable between renders.
 */
export function rankCountries(
  counts: Record<string, number>,
  top = 10,
): { top: RankedCountry[]; rest: RankedCountry[] } {
  const sorted = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const busiest = sorted[0]?.[1] ?? 1;
  const ranked = sorted.map(([code, count]) => ({
    code,
    count,
    share: count / busiest,
  }));

  return { top: ranked.slice(0, top), rest: ranked.slice(top) };
}
