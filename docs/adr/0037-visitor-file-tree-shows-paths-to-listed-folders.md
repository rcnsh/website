# 0037. The visitor file tree shows folders that lead to a listed one

In the visitor view (`src/lib/visible-tree.ts`) a folder's own files show only when it is listed, and the folder itself shows when it is listed or leads to something that is. A listed folder under an unlisted one can still be reached.

In per-folder mode, used for buckets too big to inline the whole tree, subfolders are judged by their own setting only. Without the tree behind it, a listing cannot know whether an unlisted subfolder leads to a listed one.

## Consequences

In per-folder mode a listed folder under an unlisted one is unreachable from the browser.
