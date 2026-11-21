# 0045. Bucket listings travel as relative tuples and the browser builds URLs

Listings go over the wire from `src/lib/r2.ts` with files as `[path, size, uploaded]` tuples: upload time in whole seconds, and the path relative to its listing (a bare filename in a directory, a full key in search results). The browser rebuilds the key and URL from the prefix. This keeps listing payloads small. Reading the bucket itself goes through `src/lib/bucket.ts`, so one place (`bucket.view`) decides reads.

`PUBLIC_BUCKET_URL`, with trailing slashes stripped, is the base the browser builds every file URL from. Empty means downloads proxy through the site Worker, which lets the site run without the public upload host configured.
