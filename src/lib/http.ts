import { publicFor } from "../../shared/cache-policy.ts";
import { FRESH_SECONDS as GUESTBOOK_FRESH_SECONDS } from "./guestbook-cache.ts";
import { CACHE_SECONDS as NOW_PLAYING_SECONDS } from "./now-playing.ts";

export {
  type CachePolicy,
  noStore,
  privateNoStore,
  publicFor,
  serverIslands,
  staticAssets,
  uncachedError,
} from "../../shared/cache-policy.ts";

/**
 * Each public route's policy. Where a loader's KV window exists, the max-age
 * is derived from it so the two cannot drift. `http.test.ts` pins the strings.
 */
export const policies = {
  nowPlaying: publicFor(NOW_PLAYING_SECONDS),
  /** GitHub's image proxy may keep it this long; the snapshot is ~15s fresh. */
  nowSvg: publicFor(30, { swr: 60 }),
  /** Files list, meta and search. The tree behind them refreshes every five minutes. */
  files: publicFor(60),
  guestbookList: publicFor(GUESTBOOK_FRESH_SECONDS),
  /**
   * A ceiling, not the range's KV freshness: `cached()` may already be serving
   * a copy that old, and the browser would then keep it as long again.
   */
  top: publicFor(900),
  download: publicFor(3600),
  /** Stored on each thumb object in R2, for upload.rcn.sh to serve. */
  thumbObject: publicFor(86400),
  shellFs: publicFor(3600),
} as const;

export { json, type JsonInit, privateJson } from "./json.ts";
