# 0087. Guestbook pages are keyset-paginated on (createdAt, id)

The guestbook is read newest first in pages of 25 (`PAGE_SIZE` in `src/lib/guestbook.ts`), roughly two screens on a phone. The cursor is the last row's `(createdAt, id)` (`Cursor` in `src/lib/guestbook-cache.ts`, encoded as `createdAt:id`), ordered by `created_at DESC, id DESC` so id breaks ties. Migration 0002 backdates the imported entries, so id order and time order differ, and paginating on id alone would strand them.

`readPage` selects `PAGE_SIZE + 1` rows: the extra row tells whether another page exists without a second `COUNT` query. `GuestbookEntry.createdAt` is epoch seconds, not a `Date`, because a `Date` survives neither KV serialisation nor `fetch`.

The cursor arrives from an anonymous caller and becomes two numbers in a WHERE clause, so `decodeCursor` is strict (`^(\d{1,15}):(\d{1,15})$`) and returns null for anything malformed, which serves page 1. The edge cache key for a page (`listUrl`) is built from the decoded and re-encoded cursor, not the raw query parameter, so junk parameters collapse onto the page-1 key instead of minting one edge entry per garbage string.
