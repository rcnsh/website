# 0164. Shell completion follows bash

Completion in `src/lib/shell.ts` behaves as bash does, which is what visitors expect. A single match is inserted with a trailing space, or a slash for a directory; several matches extend to their common prefix; candidates are listed only when the prefix adds nothing. It completes the word under the caret, not the last word, so a reader can fix an earlier argument. Dot-entries are offered only when the typed prefix starts with a dot, which keeps hidden entries such as `.egg` out of casual tab presses.
