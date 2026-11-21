import { z } from "zod";
import { spotifyUrl } from "./music-stats-view.ts";
import type { Read } from "./warehouse-client.ts";

const imageSchema = z
  .array(z.object({ url: z.string(), width: z.number().nullish() }))
  .default([]);

function artwork(
  images: z.infer<typeof imageSchema>,
  minWidth: number,
): string | null {
  const wide = images.filter((i) => (i.width ?? 0) >= minWidth);
  const pick = wide.length
    ? wide.reduce((a, b) => ((a.width ?? 0) <= (b.width ?? 0) ? a : b))
    : images[0];
  return pick?.url ?? null;
}

const TRACK_ART = 128;
const ARTIST_ART = 320;

const artistSchema = z.object({
  name: z.string(),
  external_urls: z.object({ spotify: z.string() }).optional(),
});

const trackSchema = z.object({
  id: z.string().nullish(),
  name: z.string(),
  duration_ms: z.number().optional(),
  external_urls: z.object({ spotify: z.string() }).optional(),
  artists: z.array(artistSchema).default([]),
  album: z
    .object({
      name: z.string().optional(),
      images: imageSchema,
    })
    .optional(),
});

export type Track = {
  trackId: string | null;
  title: string;
  artists: string;
  album: string | null;
  image: string | null;
  url: string | null;
  durationMs: number | null;
};

export type Artist = {
  name: string;
  image: string | null;
  url: string | null;
};

export type NowPlaying =
  | { isPlaying: false }
  | {
      isPlaying: true;
      trackId: string | null;
      title: string;
      artists: string;
      album: string | null;
      image: string | null;
      url: string | null;
      progressMs: number;
      durationMs: number;
    };

export type TimeRange = "short_term" | "medium_term" | "long_term";

export const TOP_FRESHNESS: Record<TimeRange, number> = {
  short_term: 60 * 60,
  medium_term: 60 * 60 * 6,
  long_term: 60 * 60 * 24,
};

function normaliseTrack(raw: z.infer<typeof trackSchema>): Track {
  return {
    trackId: raw.id ?? null,
    title: raw.name,
    artists: raw.artists.map((a) => a.name).join(", "),
    album: raw.album?.name ?? null,
    image: artwork(raw.album?.images ?? [], TRACK_ART),
    url: raw.external_urls?.spotify ?? null,
    durationMs: raw.duration_ms ?? null,
  };
}

export const nowPlaying = (): Read<NowPlaying> => ({
  path: "/api/now-playing",
  schema: z
    .object({
      item: z
        .object({
          is_playing: z.boolean().default(false),
          progress_ms: z.number().nullable().default(0),
          item: trackSchema.nullable(),
        })
        .nullable(),
    })
    .transform(({ item: playing }): NowPlaying => {
      if (!playing?.item || !playing.is_playing) return { isPlaying: false };
      const track = normaliseTrack(playing.item);
      return {
        isPlaying: true,
        trackId: track.trackId,
        title: track.title,
        artists: track.artists,
        album: track.album,
        image: track.image,
        url: track.url,
        progressMs: playing.progress_ms ?? 0,
        durationMs: track.durationMs ?? 0,
      };
    }),
});

export type RecentTrack = Track & { playedAt: string };

export const lastPlayed = (): Read<RecentTrack | null> => ({
  path: "/api/recently-played?limit=1",
  schema: z
    .object({
      items: z
        .array(z.object({ played_at: z.string(), track: trackSchema }))
        .default([]),
    })
    .transform(({ items: [last] }) =>
      last ? { ...normaliseTrack(last.track), playedAt: new Date(last.played_at).toISOString() } : null,
    ),
});

export const top = (range: TimeRange, limit: number): Read<{ tracks: Track[]; artists: Artist[] }> => ({
  path: `/api/top?range=${range}&limit=${limit}`,
  schema: z
    .object({
      tracks: z.object({ items: z.array(trackSchema).default([]) }).nullable(),
      artists: z
        .object({
          items: z
            .array(
              z.object({
                name: z.string(),
                images: imageSchema,
                external_urls: z.object({ spotify: z.string() }).optional(),
              }),
            )
            .default([]),
        })
        .nullable(),
    })
    .transform((data) => ({
      tracks: (data.tracks?.items ?? []).map(normaliseTrack),
      artists: (data.artists?.items ?? []).map((item) => ({
        name: item.name,
        image: artwork(item.images, ARTIST_ART),
        url: item.external_urls?.spotify ?? null,
      })),
    })),
  cache: { key: `top:v2:${range}:${limit}`, freshForSeconds: TOP_FRESHNESS[range] },
});

const playRowSchema = z.object({
  played_at_ms: z.number(),
  track_id: z.string(),
  track_name: z.string().nullish(),
  duration_ms: z.number().nullish(),
  album_name: z.string().nullish(),
  image_url: z.string().nullish(),
  artists: z.string().nullish(),
  artist_list: z
    .array(z.object({ id: z.string().nullish(), name: z.string() }))
    .nullish()
    .transform((list) => list ?? []),
  play_number: z.number().int().nullish(),
  first_play: z.boolean().nullish(),
  context_name: z.string().nullish(),
  context_type: z.string().nullish(),
});

const PUBLIC_CONTEXTS = new Set(["album", "artist"]);

export type Credit = { id: string | null; name: string; url: string | null };

export type StoredPlay = RecentTrack & {
  credits: Credit[];
  playNumber: number | null;
  firstPlay: boolean;
  context: string | null;
};

export const recentPlays = (limit: number): Read<StoredPlay[]> => ({
  path: `/api/plays?limit=${limit}`,
  schema: z
    .object({ plays: z.array(playRowSchema).default([]) })
    .transform(({ plays }) =>
      plays.map((row) => ({
        trackId: row.track_id,
        title: row.track_name ?? "Unknown track",
        artists: row.artists ?? "",
        album: row.album_name ?? null,
        image: row.image_url ?? null,
        url: `https://open.spotify.com/track/${row.track_id}`,
        durationMs: row.duration_ms ?? null,
        playedAt: new Date(row.played_at_ms).toISOString(),
        credits: row.artist_list.map((artist) => ({
          id: artist.id ?? null,
          name: artist.name,
          url: spotifyUrl("artist", artist.id),
        })),
        playNumber: row.play_number ?? null,
        firstPlay: row.first_play ?? false,
        context: PUBLIC_CONTEXTS.has(row.context_type ?? "") ? (row.context_name ?? null) : null,
      })),
    ),
  cache: {
    key: `recent:v4:${limit}`,
    freshForSeconds: 60 * 5,
    maxStaleSeconds: 60 * 60 * 6,
  },
});
