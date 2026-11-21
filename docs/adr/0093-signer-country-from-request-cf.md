# 0093. A signature's country comes from request.cf, with a one-off backfill

Each guestbook row has a `country` column (`src/lib/db/schema.ts`), an ISO 3166-1 alpha-2 code that feeds the map and the country ranking. It is nullable: imported rows predate it, Workers sometimes omits `cf.country`, and Tor reports `T1`. At signing time `signerCountry` in `src/pages/api/guestbook/sign.ts` reads `request.cf.country` through a cast, because the adapter's typed locals expose only `cfContext`, and stores it only when it is two uppercase letters; otherwise the column is null. `cf` is absent under `astro dev`.

Rows that predate the column are filled by `migrations/0004_backfill_guestbook_countries.sql`: every one is GB, except the owner's (`rcnsh`) most recent message, which is SG. Every signature carried over in migration 0002 was left while the owner lived in Newcastle; the one exception was written after the move to Singapore. The SG row is chosen with `ORDER BY created_at DESC, id DESC LIMIT 1`, because `created_at` has one-second resolution and ordering by id as well makes a same-second tie resolve to exactly one row.

The backfill only touches rows where `country IS NULL`, so it can fill the backlog and never overwrites a country captured from `request.cf` at signing time.
