# 0040. Route downloads by visibility

upload.rcn.sh refuses private keys, so only the owner-checked `/api/files/download` (`src/pages/api/files/download.ts`) can serve them. `baseFor` in `src/lib/files-source.ts` picks the bucket's public domain for visible files and `/api/files/download` for private ones.

The route serves private files to the owner, and all files when `PUBLIC_BUCKET_URL` is unset, because without a bucket domain there is nothing else to link. While `PUBLIC_BUCKET_URL` is set it 404s public keys: public objects are linked on the bucket's domain, and serving bucket bytes on the site's own origin is a larger risk.
