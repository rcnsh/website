# 0043. Bucket listings are bounded, and the tree is inlined only when small

Listing the bucket runs inside a request, so every loop over R2 pages has a bound. `listDirectory` (`src/lib/bucket-view.ts`) reads at most 20 pages of 1000 and marks the listing `truncated` past that, so a pathological bucket cannot spin a request forever.

The whole tree is inlined into the page only up to `FULL_TREE_MAX_OBJECTS` (5000) objects; a larger tree is too big to ship even packed, and past it the browser lazy-loads per folder. `listWholeTree` also stops after 20 pages, because zero-byte and hidden keys advance the cursor without adding to the count, so the object cap alone could run unbounded. If the listing is still truncated it returns `null` rather than a partial tree: an incomplete tree would be cached and served as the whole bucket, while `null` sends callers down the lazy-load path.

Zero-byte objects are never listed as files, since some upload clients create them as markers to fake directories. `bucketTotals` (`src/lib/bucket-totals.ts`) sums file counts and sizes across every listing in the tree, which counts each file once because the tree lists a file only in its own directory.
