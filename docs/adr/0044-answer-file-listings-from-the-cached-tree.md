# 0044. Answer /api/files/list from the cached tree

The prefix passed to `/api/files/list` (`src/pages/api/files/list.ts`) is the caller's choice, so a live R2 LIST per request would let anyone trigger a bucket scan on tap. The route answers from the cached tree instead, filtered to listed folders for visitors.

A prefix with a hidden segment gets a 400. Past `FULL_TREE_MAX_OBJECTS` (`src/lib/bucket-view.ts`) the route falls back to a live LIST, which would otherwise list `.thumbs/` and other dot paths.

Listing responses send `vary: cookie`. Signing in changes the answer, and without `Vary` the browser keeps serving the visitor copy to the owner.
