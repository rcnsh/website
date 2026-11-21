# 0053. Keep the /files keyboard model a pure function

The /files browser's key handling lives in `src/lib/files-keys.ts` as a pure mapping from a key press and its context to an action (`keyAction`). The component alone decides whether a press belongs to it. This keeps the keyboard model testable under `node --test` and separate from focus and DOM concerns.

`keyAction` returns null for any press with meta, ctrl or alt held. ⌘K/Ctrl+K opens the command palette site-wide, and the browser's own shortcuts must keep working inside /files.
