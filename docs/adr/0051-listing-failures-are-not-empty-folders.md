# 0051. Listing failures are not empty folders

Rate-limit (429) and server (500) errors from the files API are JSON too, and a client that parses any JSON as a listing shows them as an empty folder. In `src/lib/files-source.ts` a non-OK listing response, or a body with an `error` field, throws instead of being treated as a listing.

The view tracks failed prefixes separately from loaded listings. Without that, a failed fetch renders identically to an empty folder.
