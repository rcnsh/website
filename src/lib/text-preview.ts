// The /files text preview: which files get one, and how the first bytes of
// one become lines. Pure, so `node --test` can load it.

/** Bytes read off the front of a file. One ranged request, whatever its size. */
export const TEXT_PREVIEW_BYTES = 8 * 1024;

/** Lines shown. */
export const TEXT_PREVIEW_LINES = 20;

/** Kept short of the pane rather than wrapped. */
const MAX_LINE_CHARS = 240;

/** Plain-text formats worth reading the head of, beyond what `fileKind` calls text or code. */
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "log", "csv", "tsv", "asc", "ini", "cfg", "conf", "env", "sfv",
  "css", "scss", "html", "htm", "xml", "svg", "srt", "vtt", "nfo", "diff", "patch",
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "c", "h", "cpp", "hpp",
  "sh", "zsh", "bash", "fish", "ps1", "bat", "json", "jsonc", "yml", "yaml", "toml",
  "lua", "java", "kt", "rb", "php", "sql", "gitignore",
]);

export function isTextPreviewable(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/**
 * The first lines of a file from its first bytes, or null when the bytes do
 * not look like text. `truncated` says more of the file follows, in which case
 * the last line is probably cut and is dropped.
 */
export function firstLines(
  bytes: Uint8Array,
  truncated: boolean,
  max = TEXT_PREVIEW_LINES,
): string[] | null {
  // NUL never appears in text and nearly always does in a binary format.
  if (bytes.includes(0)) return null;

  // Non-fatal: a range can end mid-character, and that is not a reason to refuse.
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const replaced = text.match(/�/g)?.length ?? 0;
  // A handful of replacement characters is a cut multibyte sequence or a stray
  // Latin-1 byte; a lot of them is something that is not UTF-8 text at all.
  if (replaced > 8 && replaced > text.length / 50) return null;

  const lines = text.split(/\r\n|\r|\n/);
  if (truncated && lines.length > 1) lines.pop();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  return lines
    .slice(0, max)
    .map((line) =>
      (line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line).replace(/\t/g, "  "),
    );
}
