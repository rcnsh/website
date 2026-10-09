import type { R2Tree } from "./r2";

export type BucketTotals = { objects: number; bytes: number; lastUploaded: number | null };

/**
 * Totals across every listing in the tree. Each file appears in exactly one
 * listing — its own directory's — so summing listings counts it once.
 */
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
