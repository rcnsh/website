import type { ContributionDay } from "./github";

export type ContributionSummary = {
  /** Longest run of consecutive days with at least one contribution. */
  longestStreak: number;
  /** Contributions in the calendar's last (current, possibly partial) week. */
  thisWeek: number;
  /** The single busiest day, or null for an empty year. */
  busiest: ContributionDay | null;
};

/**
 * Figures for the heading above the graph. Walks days in calendar order, so a
 * streak runs across week boundaries; GitHub's weeks are already in order.
 */
export function summarise(weeks: ContributionDay[][]): ContributionSummary {
  let longestStreak = 0;
  let run = 0;
  let busiest: ContributionDay | null = null;

  for (const week of weeks) {
    for (const day of week) {
      run = day.count > 0 ? run + 1 : 0;
      if (run > longestStreak) longestStreak = run;
      if (day.count > 0 && (!busiest || day.count > busiest.count)) busiest = day;
    }
  }

  const last = weeks.at(-1) ?? [];
  const thisWeek = last.reduce((sum, day) => sum + day.count, 0);

  return { longestStreak, thisWeek, busiest };
}
