export const RECENT_WINDOW = 50;

type Play = {
  title: string;
  artists: string;
  url: string | null;
  playedAt: string;
  credits: { id: string | null; name: string }[];
};

export type ListeningSummary = {
  plays: number;
  tracks: number;
  artists: number;
  top: { name: string; plays: number } | null;
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
