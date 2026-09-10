import { deadline } from "./upstream";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { cached } from "./cache";

/**
 * Listening data, read from the music-warehouse Worker, which holds the only
 * Spotify grant — so this site carries no Spotify credential.
 *
 * Every call runs server-side. The browser talks only to this site's own
 * /api/spotify/* routes, so the warehouse token never reaches client
 * JavaScript. Keep it that way.
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
    title: raw.name,
    artists: raw.artists.map((a) => a.name).join(", "),
    album: raw.album?.name ?? null,
    image: artwork(raw.album?.images ?? [], TRACK_ART),
    url: raw.external_urls?.spotify ?? null,
    durationMs: raw.duration_ms ?? null,
  };
}

// --- Transport ---

async function warehouse(path: string): Promise<unknown> {
  const { MUSIC_WAREHOUSE_URL, MUSIC_WAREHOUSE_TOKEN } = env;

  if (!MUSIC_WAREHOUSE_URL || !MUSIC_WAREHOUSE_TOKEN) {
    throw new Error("music-warehouse is not configured.");
  }

  const response = await fetch(`${MUSIC_WAREHOUSE_URL.replace(/\/$/, "")}${path}`, {
    headers: { Authorization: `Bearer ${MUSIC_WAREHOUSE_TOKEN}` },
    signal: deadline(),
  });

  if (!response.ok) {
    // 503 means the warehouse's grant needs re-authorising; retrying will not fix it.
    const detail = response.status === 503 ? " (warehouse needs re-authorisation)" : "";
    throw new Error(`music-warehouse ${path} failed: ${response.status}${detail}`);
  }

  return response.json();
}

// --- Queries ---

/** Live: proxied straight through the warehouse to Spotify. */
export async function getNowPlaying(): Promise<NowPlaying> {
  // Never cached here. The API route in front collapses visitor polls per colo.
  const data = await warehouse("/api/now-playing");

  const parsed = z
    .object({
      item: z
        .object({
          is_playing: z.boolean().default(false),
          progress_ms: z.number().nullable().default(0),
          item: trackSchema.nullable(),
        })
        .nullable(),
    })
    .safeParse(data);

  const playing = parsed.success ? parsed.data.item : null;
  if (!playing?.item || !playing.is_playing) return { isPlaying: false };

  const track = normaliseTrack(playing.item);
  return {
    isPlaying: true,
    title: track.title,
    artists: track.artists,
    album: track.album,
    image: track.image,
    url: track.url,
    progressMs: playing.progress_ms ?? 0,
    durationMs: track.durationMs ?? 0,
  };
}

const topSchema = z.object({
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
});

/** Both top lists in one round trip; the warehouse returns them together. */
export async function getTop(
  range: TimeRange,
  limit = 12,
): Promise<{ tracks: Track[]; artists: Artist[] }> {
  return cached(`warehouse:top:${range}:${limit}`, TOP_FRESHNESS[range], async () => {
    const parsed = topSchema.safeParse(await warehouse(`/api/top?range=${range}&limit=${limit}`));
    // A shape change is a failure, not an empty listening history — see
    // CLAUDE.md § Maintenance › Data.
    if (!parsed.success) {
      throw new Error(`warehouse /api/top returned an unexpected shape: ${parsed.error.message}`);
    }

    return {
      tracks: (parsed.data.tracks?.items ?? []).map(normaliseTrack),
      artists: (parsed.data.artists?.items ?? []).map((item) => ({
        name: item.name,
        image: artwork(item.images, ARTIST_ART),
        url: item.external_urls?.spotify ?? null,
      })),
    };
  });
}

export type RecentTrack = Track & { playedAt: string };

const playRowSchema = z.object({
  played_at_ms: z.number(),
  track_id: z.string(),
  track_name: z.string().nullish(),
  duration_ms: z.number().nullish(),
  album_name: z.string().nullish(),
  image_url: z.string().nullish(),
  // Credited artists arrive pre-joined, comma-separated, in credit order.
  artists: z.string().nullish(),
});

/** Stored, not live: these rows survive a dead Spotify grant. */
export async function getRecentTracks(limit = 20): Promise<RecentTrack[]> {
  return cached(
    `warehouse:recent:${limit}`,
    60 * 5,
    async () => {
      const parsed = z
        .object({ plays: z.array(playRowSchema).default([]) })
        .safeParse(await warehouse(`/api/plays?limit=${limit}`));

      if (!parsed.success) {
        throw new Error(
          `warehouse /api/plays returned an unexpected shape: ${parsed.error.message}`,
        );
      }

      return parsed.data.plays.map((row) => ({
        title: row.track_name ?? "Unknown track",
        artists: row.artists ?? "",
        album: row.album_name ?? null,
        image: row.image_url ?? null,
        // The warehouse stores ids, not links; the canonical URL is derivable.
        url: `https://open.spotify.com/track/${row.track_id}`,
        durationMs: row.duration_ms ?? null,
        playedAt: new Date(row.played_at_ms).toISOString(),
      }));
    },
    // Every row renders as "played 3 hours ago", so week-old stale reads as broken.
    { maxStaleSeconds: 60 * 60 * 6 },
  );
}
