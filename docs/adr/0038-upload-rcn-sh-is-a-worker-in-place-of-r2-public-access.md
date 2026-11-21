# 0038. upload.rcn.sh is a Worker in place of R2 public access

R2's public custom domain serves every key and cannot refuse one, so it cannot keep a private folder private; only a Worker can. The `rcn-upload` Worker (`workers/upload/wrangler.jsonc`) owns upload.rcn.sh in place of the bucket's public custom domain and reads the bucket through the R2 binding.

Existing links and clients were built against the public domain, so the Worker must otherwise behave as R2's public endpoint did. `workers/upload/src/handler.ts` reproduces stored metadata, range requests, conditional requests and CORS for the site, and the HTTP behaviour lives in `shared/bucket-http.ts` (the details of `get()` are in ADR-0039).

It sends CORS headers only to allowed origins. `ALLOWED_ORIGINS` is `https://rcn.sh` only, matching the CORS policy the bucket had. It allows the `Range` request header and exposes `Content-Range`: the site reads byte ranges of media and text files cross-origin for previews and demuxing, which fails without both. A `Range` whose start is at or past the object's size gets a 416 from the Worker itself (`unsatisfiable`), because the R2 binding returns the whole object for such a range where the public domain answered 416.

It calls `decideRead` with an owner check that is always false, because private files are served only by the site's owner-checked `/api/files/download`.

`workers_dev` and `preview_urls` are false. A second public address bypasses nothing but is one more to keep track of and secure. `workers/upload/src/index.ts` has only a default export, because Workers treat every named export of the main module as an entrypoint.
