import type { ContributionDay } from "./github";

export type ContributionSummary = {
  longestStreak: number;
  thisWeek: number;
  busiest: ContributionDay | null;
};

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
