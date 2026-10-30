import { env } from "cloudflare:workers";

// Shapes of the bucket as the site sends it. Files go over the wire as tuples,
// with the key and public URL rebuilt in the browser from the prefix. Reading
// the bucket goes through lib/bucket.

/**
 * Path, size in bytes, upload time in whole seconds. The path is relative to
 * its listing: a bare filename in a directory, a full key in search results.
 */
export type R2File = [path: string, size: number, uploaded: number];

export type R2Listing = {
  /** Folder names, relative to this listing's prefix. */
  folders: string[];
  files: R2File[];
  /** Only present, and only true, when the listing was cut short. */
  truncated?: boolean;
};

/** Every directory in the bucket, keyed by prefix ("" is the root). */
export type R2Tree = Record<string, R2Listing>;

/**
 * The bucket's public origin, or "" when downloads must proxy through the
 * worker. The browser builds every file URL from it.
 */
export function publicBucketBase(): string {
  return (env.PUBLIC_BUCKET_URL || "").replace(/\/+$/, "");
}
