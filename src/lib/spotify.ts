import { lastPlayed, nowPlaying, recentPlays, top, type TimeRange } from "./spotify-reads";
import { warehouse } from "./warehouse";

/**
 * Listening data, read from the music-warehouse Worker, which holds the only
 * Spotify grant — so this site carries no Spotify credential.
 *
 * Every call runs server-side. The browser talks only to this site's own
 * /api/spotify/* routes, so the warehouse token never reaches client
 * JavaScript. Keep it that way.
 */

export type {
  Artist,
  Credit,
  NowPlaying,
  RecentTrack,
  StoredPlay,
  TimeRange,
  Track,
} from "./spotify-reads";

/**
 * Never cached here. The API route in front collapses visitor polls per colo.
 * Throws on a shape mismatch rather than reporting silence.
 */
export const getNowPlaying = () => warehouse.read(nowPlaying());

/**
 * Live, like `getNowPlaying()`. Stored plays only arrive on the warehouse's
 * ingest cron, so `getRecentTracks()` can be half an hour behind.
 */
export const getLastPlayed = () => warehouse.read(lastPlayed());

export const getTop = (range: TimeRange, limit = 12) => warehouse.read(top(range, limit));

export const getRecentTracks = (limit = 20) => warehouse.read(recentPlays(limit));
