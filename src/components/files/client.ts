import type { MediaMeta } from "@/lib/media-meta";
import { publicUrl, thumbKey, type ThumbKind, type ThumbSet } from "@/lib/thumbs";

export type Meta = MediaMeta & { size?: number; uploaded?: number; thumbs?: ThumbSet };

export const loadPreview = () => import("@/lib/media-preview");

const metaCache = new Map<string, Promise<Meta>>();

export function forgetMeta(): void {
  metaCache.clear();
}

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
  const target = base ? thumbKey(key, kind) : null;
  return target ? publicUrl(base, target) : null;
}


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
