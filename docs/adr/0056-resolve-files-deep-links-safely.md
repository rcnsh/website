# 0056. Resolve /files deep links leniently but never outside the bucket

A /files deep link is a URL hash, and hashes are user-controlled. In `src/lib/files-nav.ts`, a hash naming a file opens its folder with the file selected, and any hash that could escape the bucket (for example one with `..` segments) resolves to the root, so the browser never requests paths outside the bucket.

`locate()` in `src/lib/files-source.ts` treats a link to a folder without its trailing slash as that folder. Hand-typed and shared links often drop the slash, and they should still open the folder rather than fail.
