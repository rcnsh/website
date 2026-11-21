# 0067. Cache media metadata per upload for a year

`src/lib/media.ts` caches metadata in KV keyed on a digest of the object key and its upload time (`files:meta:1:<digest>:<uploaded>`), with a one-year freshness (`META_FRESH_SECONDS`). A re-upload changes the upload time and so the key, which makes each entry immutable and never stale.

The digest is the first 16 bytes of the SHA-256 of the object key, hex-encoded. R2 keys can be 1024 bytes and KV keys are limited to 512, so the raw key cannot be used.

See ADR-0068.
