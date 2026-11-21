# 0084. The sign-in link is never prefetched and sign-out reloads the document

The sign tile in `GuestbookSign.tsx` links to `/api/auth/login` with `data-astro-prefetch="false"`. That route mints an OAuth state cookie on every GET, so a prefetch would overwrite the state of a real sign-in.

The sign-out form (`POST /api/auth/logout`) carries `data-astro-reload`, so signing out is a full load rather than a router swap. It must reset everything the document holds for the owner, such as the player and `data-owner` on `<html>`, which a swap keeps.
