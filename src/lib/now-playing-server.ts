import { waitUntil } from "cloudflare:workers";
import { createNowPlaying } from "./now-playing-state";
import { getLastPlayed, getNowPlaying, getRecentTracks } from "./spotify";

/** The now-playing freshness logic bound to the colo cache and the warehouse. */
export const nowPlaying = createNowPlaying({
  cache: (name) => caches.open(name),
  reads: {
    live: getNowPlaying,
    lastPlayed: getLastPlayed,
    stored: async () => (await getRecentTracks(1))[0] ?? null,
  },
  now: Date.now,
  waitUntil,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});
