import { lastPlayed, nowPlaying, recentPlays, top, type TimeRange } from "./spotify-reads";
import { warehouse } from "./warehouse";

export type {
  Artist,
  Credit,
  NowPlaying,
  RecentTrack,
  StoredPlay,
  TimeRange,
  Track,
} from "./spotify-reads";

export const getNowPlaying = () => warehouse.read(nowPlaying());

export const getLastPlayed = () => warehouse.read(lastPlayed());

export const getTop = (range: TimeRange, limit = 12) => warehouse.read(top(range, limit));

export const getRecentTracks = (limit = 20) => warehouse.read(recentPlays(limit));
