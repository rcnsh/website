export const TEXT_PREVIEW_BYTES = 8 * 1024;

export const TEXT_PREVIEW_LINES = 20;

const MAX_LINE_CHARS = 240;

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

export function firstLines(
  bytes: Uint8Array,
  truncated: boolean,
  max = TEXT_PREVIEW_LINES,
): string[] | null {
  if (bytes.includes(0)) return null;

  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const replaced = text.match(/�/g)?.length ?? 0;
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
