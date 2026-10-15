/**
 * Figures for the music page's stats tile, derived from the recent-plays
 * window and nothing else. Dependency-free so it can be tested under node.
 */

/** How many recent plays the music page reads. The stats and the list share it. */
export const RECENT_WINDOW = 50;

type Play = {
  title: string;
  artists: string;
  url: string | null;
  playedAt: string;
  /** Credited artists in credit order; the first is the lead. */
  credits: { id: string | null; name: string }[];
};

export type ListeningSummary = {
  plays: number;
  tracks: number;
  artists: number;
  top: { name: string; plays: number } | null;
  /** ISO time of the oldest play in the window. */
  since: string | null;
};

export function summarise(plays: Play[]): ListeningSummary {
  const tracks = new Set<string>();
  const byLead = new Map<string, { plays: number; name: string }>();
  let since: string | null = null;

  for (const play of plays) {
    tracks.add(play.url ?? `${play.title}|${play.artists}`);
    if (!since || play.playedAt < since) since = play.playedAt;

    const lead = play.credits[0];
    if (!lead) continue;
    // Export-only artists have no id; their name is the next best key.
    const key = lead.id ?? `name:${lead.name.toLowerCase()}`;
    const entry = byLead.get(key);
    if (entry) entry.plays += 1;
    else byLead.set(key, { plays: 1, name: lead.name });
  }

  let top: ListeningSummary["top"] = null;
  for (const entry of byLead.values()) {
    if (!top || entry.plays > top.plays) top = { name: entry.name, plays: entry.plays };
  }

  return { plays: plays.length, tracks: tracks.size, artists: byLead.size, top, since };
}
