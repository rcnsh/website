# 0035. Bucket key shapes live in one module

The site, the browser and the upload.rcn.sh Worker must agree on what names an object or a folder, or one could serve a key another refuses. `objectKey`, `folderPrefix`, the hidden-segment rule and `THUMBS_PREFIX` live in `shared/bucket-keys.ts` and nowhere else.

A key is hidden if any segment along its path starts with a dot, as with `ls`, so everything under `.thumbs/` and any other dot folder is never listed or served as an ordinary file. `objectKey` accepts a key only if it is non-empty, does not end in `/` and has no `..` segment; whether it is hidden or readable is a separate step, left to `decideRead`. `folderPrefix` drops leading and doubled slashes and returns `null`, not `""`, for traversal or a hidden folder, since `""` means the root and a caller falling back to it on bad input would list the bucket root in place of a refused folder.
