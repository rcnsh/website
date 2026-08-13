import { env } from "cloudflare:workers";
import { z } from "zod";
import { cached } from "./cache";

/**
 * Spotify. The schemas describe only the fields actually rendered, so a field
 * Spotify adds or nulls can't take the page down.
 */

const TOKEN_CACHE_KEY = "spotify:access_token";

const imageSchema = z.array(z.object({ url: z.string() })).default([]);
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

/**
 * How long each range stays fresh, matched to how fast it moves. A long window
 * only means Spotify is polled less — `cached()` serves stale instantly either
 * way.
 */
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
    image: raw.album?.images?.[0]?.url ?? null,
    url: raw.external_urls?.spotify ?? null,
    durationMs: raw.duration_ms ?? null,
  };
}

// --- Auth ---

async function requestAccessToken(): Promise<{ token: string; ttl: number }> {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = env;

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    throw new Error("Spotify credentials are not configured.");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: SPOTIFY_REFRESH_TOKEN,
    }),
  });

  if (!response.ok) {
    throw new Error(`Spotify token refresh failed: ${response.status}`);
  }

  const { access_token, expires_in } = z
    .object({ access_token: z.string(), expires_in: z.number().default(3600) })
    .parse(await response.json());

  return { token: access_token, ttl: expires_in };
}

async function getAccessToken(): Promise<string> {
  const kv = env.CACHE;
  if (kv) {
    const hit = await kv.get(TOKEN_CACHE_KEY);
    if (hit) return hit;
  }

  const { token, ttl } = await requestAccessToken();

  if (kv) {
    // Expire a minute early so a token is never used right as it dies.
    await kv.put(TOKEN_CACHE_KEY, token, {
      expirationTtl: Math.max(ttl - 60, 60),
    });
  }

  return token;
}

async function spotify(path: string): Promise<unknown> {
  const token = await getAccessToken();
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 204) return null;
  if (!response.ok) {
    throw new Error(`Spotify ${path} failed: ${response.status}`);
  }

  const body = await response.text();
  return body.trim() ? JSON.parse(body) : null;
}

// --- Queries ---

export async function getNowPlaying(): Promise<NowPlaying> {
  // Never cached — the whole point is that it is live.
  const data = await spotify("/me/player/currently-playing");
  if (!data) return { isPlaying: false };

  const parsed = z
    .object({
      is_playing: z.boolean().default(false),
      progress_ms: z.number().nullable().default(0),
      item: trackSchema.nullable(),
    })
    .safeParse(data);

  if (!parsed.success || !parsed.data.item || !parsed.data.is_playing) {
    return { isPlaying: false };
  }

  const track = normaliseTrack(parsed.data.item);
  return {
    isPlaying: true,
    title: track.title,
    artists: track.artists,
    album: track.album,
    image: track.image,
    url: track.url,
    progressMs: parsed.data.progress_ms ?? 0,
    durationMs: track.durationMs ?? 0,
  };
}

export async function getTopTracks(range: TimeRange, limit = 12): Promise<Track[]> {
  return cached(`spotify:top-tracks:${range}:${limit}`, TOP_FRESHNESS[range], async () => {
    const data = await spotify(`/me/top/tracks?time_range=${range}&limit=${limit}`);
    const parsed = z
      .object({ items: z.array(trackSchema).default([]) })
      .safeParse(data);
    return parsed.success ? parsed.data.items.map(normaliseTrack) : [];
  });
}

export async function getTopArtists(range: TimeRange, limit = 12): Promise<Artist[]> {
  return cached(`spotify:top-artists:${range}:${limit}`, TOP_FRESHNESS[range], async () => {
    const data = await spotify(`/me/top/artists?time_range=${range}&limit=${limit}`);
    const parsed = z
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
      .safeParse(data);

    if (!parsed.success) return [];
    return parsed.data.items.map((item) => ({
      name: item.name,
      image: item.images?.[0]?.url ?? null,
      url: item.external_urls?.spotify ?? null,
    }));
  });
}

export type RecentTrack = Track & { playedAt: string };

export async function getRecentTracks(limit = 20): Promise<RecentTrack[]> {
  return cached(`spotify:recent:${limit}`, 60 * 5, async () => {
    const data = await spotify(`/me/player/recently-played?limit=${limit}`);
    const parsed = z
      .object({
        items: z
          .array(z.object({ track: trackSchema, played_at: z.string() }))
          .default([]),
      })
      .safeParse(data);

    if (!parsed.success) return [];
    return parsed.data.items.map((item) => ({
      ...normaliseTrack(item.track),
      playedAt: item.played_at,
    }));
  });
}
