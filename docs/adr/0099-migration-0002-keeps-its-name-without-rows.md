# 0099. Migration 0002 keeps its name and holds no rows

`migrations/0002_import_old_guestbook.sql` is the migration that carries the old site's guestbook into D1. Its rows are thirteen real people's GitHub ids, usernames, display names and avatar URLs: public profile data, but published to a guestbook on rcn.sh, not to a public repository, and `/api/guestbook/delete` cannot reach a git history.

The file stays in the repository under its original name, with no rows in it, and the repository's history carries none either. The imported entries exist only in the production database; a database built from scratch starts without them. Other people's signatures are not part of the schema.

The name has to stay because `wrangler d1 migrations apply` records applied migrations by name in `d1_migrations`: while the name exists, production keeps skipping it. Renumbering the file re-runs it.

## Consequences

The imported entries are backdated and have no country, which shapes the pagination cursor, the country backfill in migration 0004 and the "without a location" wording on the map.
