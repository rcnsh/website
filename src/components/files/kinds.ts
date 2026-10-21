import type { FileKind } from "@/lib/files-nav";

/**
 * One colour per kind of file, shared by the usage bar and the browser's
 * icons so the two read as one key. Decoration on top of a label, never the
 * only signal.
 */
export const KIND_COLOUR: Record<FileKind, string> = {
  image: "#5fb98a",
  video: "#b58ce6",
  audio: "#e68cb7",
  archive: "#d8a24f",
  doc: "#e08a8a",
  code: "var(--color-brand)",
  text: "var(--color-ink-faint)",
  file: "var(--color-line-strong)",
};

/** Hidden folders' share of the bar for visitors: grey, striped so it never reads as a kind. */
export const PRIVATE_COLOUR =
  "repeating-linear-gradient(135deg, var(--color-line-strong) 0 3px, var(--color-line) 3px 6px)";

export const PRIVATE_LABEL = "Private";

export const KIND_LABEL: Record<FileKind, string> = {
  image: "Images",
  video: "Video",
  audio: "Audio",
  archive: "Archives",
  doc: "Documents",
  code: "Code",
  text: "Text",
  file: "Other",
};
