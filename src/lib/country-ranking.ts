export type RankedCountry = {
  code: string;
  count: number;
  share: number;
};

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
