/** The colo cache entry `/api/spotify/now-playing` serves every visitor from. */
export async function nowPlayingCache(origin: string): Promise<{ cache: Cache; key: Request }> {
  return { cache: await caches.open("now-playing"), key: new Request(`${origin}/api/spotify/now-playing`) };
}
