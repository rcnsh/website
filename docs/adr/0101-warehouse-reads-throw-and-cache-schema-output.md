# 0101. Warehouse reads throw on failure and cache their schema's output

`cached()` implements stale-while-revalidate by catching a loader's rejection and keeping what it holds (CLAUDE.md, Maintenance > Data). A warehouse read that resolved with an empty value on failure would be written to KV and replace good data.

`read()` in `src/lib/warehouse-client.ts` rejects on any failure: a failed response, a timeout from `deadline()`, or a schema mismatch, which throws `WarehouseShapeError`. A warehouse 503 means its Spotify grant has lapsed, so its error message says the warehouse needs re-authorisation; retrying will not fix it. A `Read` without `cache` is live; a cached read stores its schema's output, transforms included, under a `warehouse:`-namespaced key.

The read definitions live in `src/lib/spotify-reads.ts`, free of `cloudflare:workers`, so tests drive them through `createWarehouse` with a fake transport. Their schemas describe only the fields the site renders, so a field the upstream adds or nulls cannot take a page down.

## Consequences

Because transforms are cached, changing what a schema outputs requires a new key. Keys are versioned and bumped on every output change (`top:v2`, `recent:v4`): v1 top lacked track ids; recent v2 lacked credits and held playlist names, v3 dropped them, v4 added track ids. Without the bump, stale-while-revalidate serves old-shaped values to new code.

See ADR-0024.
