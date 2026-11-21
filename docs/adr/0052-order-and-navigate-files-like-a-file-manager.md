# 0052. Order and navigate /files like a file manager

`src/lib/files-nav.ts` holds the /files path math, folder rollups, sorting, search and deep-link hash handling with no DOM or runtime imports, so `node --test` can load it directly. Its behaviour follows a desktop file manager's.

Names sort with `Intl.Collator('en', { numeric: true, sensitivity: 'base' })`: case-insensitive, and 2 before 10. `sortEntries` keeps folders first in every order; name sorts A to Z, size largest first, date newest first. `reverse` flips the chosen order but not the folder grouping, and unknown sizes and dates sort last either way, so reversing never puts unknown rows or files above folders.

Going up from a folder to an ancestor selects the child of the ancestor that was passed through, so stepping out of a folder leaves that folder selected.
