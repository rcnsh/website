import { z } from "zod";
import { cached } from "./cache";
import { warehouse } from "./spotify";

/**
 * Aggregate listening stats for /music/stats, from the warehouse's
 * /api/stats/* routes. Those hold only counts, shares, names and months — no
 * play rows — and are themselves snapshotted for hours, so these KV windows
 * mostly keep warehouse round trips off the island's critical path.
 *
 * Schemas describe the fields rendered, and a mismatch throws, so a shape
 * change never gets cached as an empty page (CLAUDE.md § Maintenance › Data).
 */

const share = z.number().min(0).max(1);
const month = z.string().regex(/^\d{4}-\d{2}$/);

const streakSchema = z.object({
  // Null while the streak is still running: the warehouse gives those in
  // whole weeks only.
  days: z.number().int().nullable(),
  weeks: z.number().int(),
  from: month,
  to: month,
  running: z.boolean(),
});

const streakSetSchema = z.object({
  threshold: z.number().int(),
  current_weeks: z.number().int(),
  longest: streakSchema.nullable(),
  top: z.array(streakSchema),
  active_share: share,
});

const eraRhythmSchema = z.object({
  key: z.string(),
  label: z.string(),
  from: month,
  to: month.nullable(),
  hour_share: z.array(share).length(24).nullable(),
  grid: z.array(z.array(share).length(24)).length(7).nullable(),
  hours_available_from: month.nullable(),
  grid_available_from: month.nullable(),
});

const rhythmSchema = z.object({
  as_of: z.string(),
  range: z.object({ from: month, to: month }),
  streaks: z.array(streakSetSchema),
  eras: z.array(eraRhythmSchema),
  // Every figure above again, per local calendar year, for the page's year switch.
  years: z.array(
    z.object({
      year: z.string(),
      partial: z.boolean(),
      streaks: z.array(streakSetSchema),
      eras: z.array(eraRhythmSchema),
    }),
  ),
});

const repeatSchema = z.object({
  as_of: z.string(),
  window_days: z.number().int(),
  tracks: z.array(
    z.object({
      track_id: z.string(),
      name: z.string(),
      artists: z.string(),
      album: z.string().nullable(),
      image: z.string().nullable(),
      plays: z.number().int(),
      days: z.number().int(),
      daily: z.array(z.number().int()),
    }),
  ),
  albums: z.array(
    z.object({
      name: z.string(),
      artist: z.string(),
      image: z.string().nullable(),
      tracks_on_repeat: z.number().int(),
      plays: z.number().int(),
    }),
  ),
});

const albumSchema = z.object({
  name: z.string(),
  artist: z.string(),
  image: z.string().nullable(),
  plays: z.number().int(),
  songs: z.number().int(),
  from: month,
  to: month,
});

const albumsSchema = z.object({
  as_of: z.string(),
  min_songs: z.number().int(),
  albums: z.array(albumSchema),
  years: z.array(z.object({ year: z.string(), partial: z.boolean(), albums: z.array(albumSchema) })),
});

const periodSchema = z.object({
  period: z.string(),
  partial: z.boolean(),
  plays: z.number().int(),
  artists: z.array(z.object({ name: z.string(), plays: z.number().int(), share })),
  tracks: z.array(
    z.object({ name: z.string(), artist: z.string(), plays: z.number().int(), image: z.string().nullable() }),
  ),
});

const topSchema = z.object({
  as_of: z.string(),
  quarters: z.array(periodSchema),
  years: z.array(periodSchema),
  leaders: z.array(z.object({ name: z.string(), plays: z.number().int(), share: z.array(share) })),
});

const artistShare = z.object({ artist: z.string(), share });
const shift = z.object({ artist: z.string(), before: share, after: share });

const erasSchema = z.object({
  as_of: z.string(),
  move_month: month.nullable(),
  window_months: z.number().int(),
  singapore: z.object({ from: month, to: month }).nullable(),
  before: z.object({ from: month, to: month }).nullable(),
  ready: z.boolean(),
  summary: z
    .object({
      known_artist_share: share,
      new_artists: z.number().int(),
      artists: z.number().int(),
      change: share,
      typical_change: z.object({
        median: share,
        min: share,
        max: share,
        windows: z.number().int(),
        exceeded_by: z.number().int(),
      }),
    })
    .nullable(),
  top: z.object({ newcastle: z.array(artistShare), before: z.array(artistShare), singapore: z.array(artistShare) }),
  risers: z.array(shift),
  fallers: z.array(shift),
});

export type Rhythm = z.infer<typeof rhythmSchema>;
export type StreakSet = z.infer<typeof streakSetSchema>;
export type EraRhythm = z.infer<typeof eraRhythmSchema>;
export type TopAlbum = z.infer<typeof albumSchema>;
export type OnRepeat = z.infer<typeof repeatSchema>;
export type TopAlbums = z.infer<typeof albumsSchema>;
export type TopOverTime = z.infer<typeof topSchema>;
export type Eras = z.infer<typeof erasSchema>;

async function load<T>(
  name: string,
  schema: z.ZodType<T>,
  freshForSeconds: number,
  maxStaleSeconds: number,
): Promise<T> {
  return cached(
    `warehouse:stats:${name}`,
    freshForSeconds,
    async () => {
      const parsed = schema.safeParse(await warehouse(`/api/stats/${name}`));
      if (!parsed.success) {
        throw new Error(`warehouse /api/stats/${name} returned an unexpected shape: ${parsed.error.message}`);
      }
      return parsed.data;
    },
    { maxStaleSeconds },
  );
}

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

// Fresh for half the warehouse's own snapshot window or less, so a refresh
// there shows up here within the same window. Stale is capped where old data
// reads as wrong: "on repeat" a week late is a different list.
export const getRhythm = () => load("rhythm", rhythmSchema, HOUR, 14 * DAY);
export const getOnRepeat = () => load("on-repeat", repeatSchema, 30 * 60, DAY);
export const getTopAlbums = () => load("albums", albumsSchema, 6 * HOUR, 14 * DAY);
export const getTopOverTime = () => load("top-over-time", topSchema, 6 * HOUR, 14 * DAY);
export const getEras = () => load("eras", erasSchema, 6 * HOUR, 30 * DAY);
