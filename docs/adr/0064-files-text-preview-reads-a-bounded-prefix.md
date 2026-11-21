# 0064. File text previews read a bounded prefix and refuse what is not text

Which files get a text preview (`isTextPreviewable`) and how their first bytes become lines (`firstLines`) is a pure module, `src/lib/text-preview.ts`, so `node --test` can load it.

A preview reads the first `TEXT_PREVIEW_BYTES` (8 KiB) of a file with one ranged request whatever the file's size, so a preview's cost is bounded. `firstLines` returns at most `TEXT_PREVIEW_LINES` (20) lines, each cut at `MAX_LINE_CHARS` (240) characters rather than wrapped, to stay short of the pane. When more of the file follows, it drops the last line, which is probably cut mid-line.

`firstLines` returns null when the bytes do not look like text. Any NUL byte refuses the file: NUL never appears in text and nearly always does in a binary format. `TextDecoder` is used non-fatally, because a range can end mid-character and that is not a reason to refuse. Instead the preview refuses text with more than 8 replacement characters and more than one per 50 characters: a handful is a cut multibyte sequence or a stray Latin-1 byte, and a lot of them is something that is not UTF-8 text at all.
