# 0034. One function decides who may read a bucket key

The site Worker and the upload.rcn.sh Worker both serve bucket bytes. If they disagreed, a key the site hides could be served by upload.rcn.sh, or the other way round. Visibility logic therefore lives in `shared/visibility.ts`, imported by both, and every read path (upload.rcn.sh, `/api/files/download`, `/api/files/meta`) asks `decideRead`.

`decideRead` refuses in a fixed order: no object named (400), a dot path (404), unreadable rules (503), then a private file for anyone but the owner (404). Each refusal's status and message are in `REFUSALS`, which the site's routes answer from, so `/api/files/download` and `/api/files/meta` cannot drift apart. A private file answers like a missing one, so its existence is never confirmed. It calls `isOwner` only when the file is private, so a public read never costs a session lookup.

A key under `.thumbs/` is governed by the visibility of the file it was made from (`accessSubject`), so the thumbs of a private file do not publish its frames to anyone. Any other dot path is governed by nothing and is refused for every reader, the owner included.
