# 0168. The line editor accounts for deferred autowrap

Terminals defer autowrap: a line that exactly fills its last row leaves the cursor parked on that row's last column rather than on the next row. When the prompt width plus the line length is an exact multiple of the column count, `draw()` in `src/lib/line-editor.ts` emits a CRLF to step onto the next row, so the row and column arithmetic used to restore the caret stays right. `leave()` does not add another, which would leave a blank row.

`begin(prompt, width)` redraws from the top row of the line drawn last, so a line left mid-edit with output printed above it is redrawn in place rather than duplicated. After `leave()`, `commit()`, `abandon()` or `cleared()` the top row is the cursor's own. The prompt's printed width is passed separately from the prompt string, because the prompt may contain colour escape sequences and its string length is not its width.

`src/lib/line-editor.test.ts` tests the editor against a minimal screen model that implements deferred autowrap as xterm does, plus CR, LF, cursor up and forward, and erase-below. Wrapped-line redraw bugs show only when the output is replayed onto a grid with the real terminal's deferred-wrap semantics, and that subset is the behaviour the editor relies on.
