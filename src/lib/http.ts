import { type CachePolicy, noStore, publicFor, serverIslands } from "../../shared/cache-policy.ts";
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

export const policies = {
  nowPlaying: publicFor(NOW_PLAYING_SECONDS),
  nowSvg: publicFor(30, { swr: 60 }),
  files: publicFor(60),
  guestbookList: publicFor(GUESTBOOK_FRESH_SECONDS),
  top: publicFor(900),
  download: publicFor(3600),
  thumbObject: publicFor(86400),
  shellFs: publicFor(3600),
} as const;

export const LIVE_ISLANDS = ["GuestbookTotals", "GuestbookCountries", "GuestbookEntries"];

export function islandPolicy(pathname: string): CachePolicy {
  const name = pathname.slice(pathname.lastIndexOf("/") + 1);
  return LIVE_ISLANDS.includes(name) ? noStore : serverIslands;
}

export { json, type JsonInit, privateJson } from "./json.ts";
