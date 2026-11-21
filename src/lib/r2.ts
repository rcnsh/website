import { env } from "cloudflare:workers";

export type R2File = [path: string, size: number, uploaded: number];

export type R2Listing = {
  folders: string[];
  files: R2File[];
  truncated?: boolean;
};

export type R2Tree = Record<string, R2Listing>;

export function publicBucketBase(): string {
  return (env.PUBLIC_BUCKET_URL || "").replace(/\/+$/, "");
}
