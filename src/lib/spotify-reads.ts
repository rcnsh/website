import { z } from "zod";
import { spotifyUrl } from "./music-stats-view.ts";
import type { Read } from "./warehouse-client.ts";

/**
 * What `./spotify` reads from the music-warehouse, and how each answer becomes
 * what the site renders. Dependency-free of `cloudflare:workers`, so tests run
 * these through a client with a fake transport.
 *
 * The schemas describe only the fields actually rendered, so a field the
 * upstream adds or nulls can't take the page down.
 */

const imageSchema = z
  .array(z.object({ url: z.string(), width: z.number().nullish() }))
  .default([]);

/** Smallest cover at least `minWidth` across, else the largest on offer. */
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

/** Track art is drawn at 56px at most; this is 2x on the densest screen. */
const TRACK_ART = 128;
/** Artist tiles are a grid column wide — around 160px on a phone. */
const ARTIST_ART = 320;

const artistSchema = z.object({
  name: z.string(),
  external_urls: z.object({ spotify: z.string() }).optional(),
});

const trackSchema = z.object({
  // Null for local files, which Spotify can't play remotely.
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

// A long window only means the warehouse is polled less; `cached()` serves
// stale instantly either way.
const TOP_FRESHNESS: Record<TimeRange, number> = {
  short_term: 60 * 60, // "4 weeks" — shifts day to day
  medium_term: 60 * 60 * 6, // "6 months" — shifts over weeks
  long_term: 60 * 60 * 24, // "all time" — barely shifts at all
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

/** Live: proxied straight through the warehouse to Spotify. */
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

/** Live, like `nowPlaying()`. */
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

/** Both top lists in one round trip; the warehouse returns them together. */
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
  // v2 carries track ids; v1 entries lack them.
  cache: { key: `top:v2:${range}:${limit}`, freshForSeconds: TOP_FRESHNESS[range] },
});

const playRowSchema = z.object({
  played_at_ms: z.number(),
  track_id: z.string(),
  track_name: z.string().nullish(),
  duration_ms: z.number().nullish(),
  album_name: z.string().nullish(),
  image_url: z.string().nullish(),
  // Credited artists arrive pre-joined, comma-separated, in credit order.
  artists: z.string().nullish(),
  // The same artists one by one, so a name containing ", " stays whole.
  artist_list: z
    .array(z.object({ id: z.string().nullish(), name: z.string() }))
    .nullish()
    .transform((list) => list ?? []),
  // Which play of its song this was, counting every edition.
  play_number: z.number().int().nullish(),
  first_play: z.boolean().nullish(),
  // The album, artist or playlist it was started from, when known.
  context_name: z.string().nullish(),
  context_type: z.string().nullish(),
});

/** Context types whose name the site shows as "from …". */
const PUBLIC_CONTEXTS = new Set(["album", "artist"]);

export type Credit = { id: string | null; name: string; url: string | null };

/** A stored play, with what only the warehouse knows about it. */
export type StoredPlay = RecentTrack & {
  credits: Credit[];
  playNumber: number | null;
  firstPlay: boolean;
  context: string | null;
};

/** Stored, not live: these rows survive a dead Spotify grant. */
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
        // The warehouse stores ids, not links; the canonical URL is derivable.
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
        // Albums and artists only: playlist names stay private, and autoplay
        // after a playlist ends is still reported as that playlist.
        context: PUBLIC_CONTEXTS.has(row.context_type ?? "") ? (row.context_name ?? null) : null,
      })),
    ),
  cache: {
    // Versioned: a value cached before credits were read lacks them, and
    // stale-while-revalidate would serve it to code that expects them. v3
    // drops the playlist names v2 cached; v4 adds track ids.
    key: `recent:v4:${limit}`,
    freshForSeconds: 60 * 5,
    // Every row renders as "played 3 hours ago", so week-old stale reads as broken.
    maxStaleSeconds: 60 * 60 * 6,
  },
});
