# 0069. Serve media metadata under the download read rules

`/api/files/meta` (`src/pages/api/files/meta.ts`) reads container, tracks and tags from ranged reads on the Worker. A private file's metadata is the owner's alone, so the route decides access with the same `canRead` as downloads and refuses with `not-found-json`, which matches the download route's 404. The two routes never disagree and never confirm a private key exists.

Refusals answer from `REFUSALS` as JSON errors, so unreadable rules are a 503 here as on the download route and upload.rcn.sh. A thrown read decision becomes an `unavailable` refusal too, because the session lookup behind the owner check hits D1, which can be briefly unavailable. A failed metadata read after access is decided stays a 502.

A failed thumbs lookup is logged and answered as `NO_THUMBS` instead of failing the metadata response. Missing thumbs only mean the browser generates previews itself.
