import type { R2Tree } from "./r2";

export type BucketTotals = { objects: number; bytes: number; lastUploaded: number | null };

export function bucketTotals(tree: R2Tree): BucketTotals {
  let objects = 0;
  let bytes = 0;
  let lastUploaded: number | null = null;

  for (const listing of Object.values(tree)) {
    for (const [, size, uploaded] of listing.files) {
      objects += 1;
      bytes += size;
      if (lastUploaded === null || uploaded > lastUploaded) lastUploaded = uploaded;
    }
  }

  return { objects, bytes, lastUploaded };
}

export type HiddenTotals = { objects: number; bytes: number };

export function hiddenTotals(full: R2Tree, visible: R2Tree): HiddenTotals {
  const all = bucketTotals(full);
  const seen = bucketTotals(visible);
  return { objects: all.objects - seen.objects, bytes: all.bytes - seen.bytes };
}
