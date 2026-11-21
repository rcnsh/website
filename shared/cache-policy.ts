export type CachePolicy = string;

export type PublicOptions = {
  edge?: number;
  swr?: number;
};

export function publicFor(seconds: number, { edge, swr }: PublicOptions = {}): CachePolicy {
  return [
    "public",
    `max-age=${seconds}`,
    edge === undefined ? null : `s-maxage=${edge}`,
    swr === undefined ? null : `stale-while-revalidate=${swr}`,
  ]
    .filter(Boolean)
    .join(", ");
}

export const noStore: CachePolicy = "no-store";

export const uncachedError: CachePolicy = noStore;

export const privateNoStore: CachePolicy = "private, no-store";

export const serverIslands: CachePolicy = publicFor(60, { edge: 300, swr: 3600 });

export const staticAssets: CachePolicy = publicFor(0, { edge: 600 });
