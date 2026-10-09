/**
 * Figures for the music page's stats tile, derived from the recent-plays
 * window and nothing else. Dependency-free so it can be tested under node.
 */

/** How many recent plays the music page reads. The stats and the list share it. */
export const RECENT_WINDOW = 50;

type Play = { title: string; artists: string; url: string | null; playedAt: string };

export type ListeningSummary = {
  plays: number;
  tracks: number;
  artists: number;
  top: { name: string; plays: number } | null;
  /** ISO time of the oldest play in the window. */
  since: string | null;
};

/**
 * The warehouse joins credits with ", ", and some names contain one
 * ("Tyler, The Creator"), so splitting would invent artists. The lead credit
 * is the part before the first separator: wrong as a display name for those
 * few, but stable, so counting by it is still right.
 */
function leadKey(artists: string): string {
  return (artists.split(", ")[0] ?? artists).trim().toLowerCase();
}

export function summarise(plays: Play[]): ListeningSummary {
  const tracks = new Set<string>();
  const byLead = new Map<string, { plays: number; name: string }>();
  let since: string | null = null;

  for (const play of plays) {
    tracks.add(play.url ?? `${play.title}|${play.artists}`);
    if (!since || play.playedAt < since) since = play.playedAt;

    if (!play.artists) continue;
    const key = leadKey(play.artists);
    const entry = byLead.get(key);
    if (!entry) {
      byLead.set(key, { plays: 1, name: play.artists });
      continue;
    }
    entry.plays += 1;
    // The shortest credit seen is the solo one, which is the real name even
    // when it contains the separator.
    if (play.artists.length < entry.name.length) entry.name = play.artists;
  }

  let top: ListeningSummary["top"] = null;
  for (const entry of byLead.values()) {
    if (!top || entry.plays > top.plays) top = { name: entry.name, plays: entry.plays };
  }

  return { plays: plays.length, tracks: tracks.size, artists: byLead.size, top, since };
}
