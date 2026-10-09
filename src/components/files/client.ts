import type { MediaMeta } from "@/lib/media-meta";
import { publicUrl, thumbKey, type ThumbKind, type ThumbSet } from "@/lib/thumbs";

// Browser-side helpers shared by the navigator's preview pane and its grid
// cards, so both read one copy of each file's metadata.

export type Meta = MediaMeta & { size?: number; uploaded?: number; thumbs?: ThumbSet };

/** Mediabunny and the generators, fetched the first time anything needs them. */
export const loadPreview = () => import("@/lib/media-preview");

/** Per page: metadata is immutable for an upload, and the API caches it too. */
const metaCache = new Map<string, Promise<Meta>>();

export function fetchMeta(key: string, reload = false): Promise<Meta> {
  const cached = metaCache.get(key);
  if (cached && !reload) return cached;
  const request = fetch(`/api/files/meta?key=${encodeURIComponent(key)}`, {
    cache: reload ? "reload" : "default",
  }).then(async (response) => {
    if (!response.ok) throw new Error(`meta ${response.status}`);
    return (await response.json()) as Meta;
  });
  metaCache.set(key, request);
  // A failure is not kept: the next panel to open retries.
  request.catch(() => {
    if (metaCache.get(key) === request) metaCache.delete(key);
  });
  return request;
}

export async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

export function thumbUrl(base: string, key: string, kind: ThumbKind): string | null {
  // Without a public domain thumbs are unreachable: the download route
  // refuses hidden keys. The browser draws its own instead.
  const target = base ? thumbKey(key, kind) : null;
  return target ? publicUrl(base, target) : null;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/**
 * Runs at most `limit` tasks at once, in the order asked. A grid of cards
 * would otherwise start every metadata request and decode at the same time.
 */
export function queue(limit: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  const next = () => {
    if (running >= limit) return;
    const start = waiting.shift();
    if (start) start();
  };
  return function run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        if (signal?.aborted) {
          reject(signal.reason);
          next();
          return;
        }
        running++;
        task()
          .then(resolve, reject)
          .finally(() => {
            running--;
            next();
          });
      };
      waiting.push(start);
      next();
    });
  };
}
