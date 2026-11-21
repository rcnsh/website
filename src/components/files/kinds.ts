import type { FileKind } from "@/lib/files-nav";

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
