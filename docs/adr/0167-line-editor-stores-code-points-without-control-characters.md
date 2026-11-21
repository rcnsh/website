# 0167. The line editor stores code points and never holds a control character

`LineEditor` in `src/lib/line-editor.ts` stores the line as an array of code points. Indexing by UTF-16 unit would let the cursor and backspace split a surrogate pair such as an emoji. Every insert passes through `inline()`, so the line never holds a control character, which would otherwise be echoed to the terminal as an escape sequence.

Completion (`complete()` in `src/lib/shell.ts`) reports positions as JavaScript string indices, so `LineEditor.set(line, caret)` takes the caret as a UTF-16 index and converts it to a code-point index.
