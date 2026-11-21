# 0032. Folder visibility has three levels and defaults to unlisted

Uploads reach the bucket from tools like ShareX and from backups, usually into folders nobody has looked at yet. Discoverability and access are separate questions for these files: some should be shown on /files, some only shared by link, and some kept to the owner.

Each folder in `file_visibility` (D1, `src/lib/db/schema.ts`) is `listed` (shown on /files), `unlisted` (not shown, but served to anyone with the URL) or `private` (served only to the owner, through `/api/files/download`, the one route that can check the owner session). The table has one row per folder that has its own setting, and a folder without a row inherits from its nearest ancestor (`shared/visibility.ts`). `prefix` is `""` for the bucket root and otherwise a folder prefix ending in `/`, matching `folderPrefix` in `shared/bucket-keys.ts`. `migrations/0006_file_visibility.sql` seeds the root's row as `unlisted`, so a new upload folder is hidden until the owner chooses otherwise. The seed uses `INSERT OR IGNORE`, so a replayed migration never overwrites a setting the owner has changed.

The upload.rcn.sh Worker reads the table by raw SQL rather than through drizzle, so renaming a column breaks the upload Worker as well as the site.

The lookups in `shared/visibility.ts` test a prefix with `Object.hasOwn`, never the `in` operator: `in` sees prototype properties, so a folder named `constructor/` would match Object's and resolve to a bogus setting.
