/**
 * Dot colours for the languages the pinned repos are likely to report. Linguist's
 * own colours, except where one fails 3:1 against --color-surface (Python's blue,
 * TypeScript's), which are lifted along their hue. Unlisted languages get the
 * neutral dot rather than a guess.
 */
const COLOURS: Record<string, string> = {
  TypeScript: "#6f9bd8",
  JavaScript: "#e3d36b",
  Python: "#d8c56f",
  Astro: "#c58bdc",
  Rust: "#dea584",
  Go: "#4fc3d9",
  Shell: "#89e051",
  HTML: "#e8794f",
  CSS: "#9a7fd0",
  Java: "#c99a5b",
  "C++": "#e05d8a",
  C: "#8d8d8d",
};

export const NEUTRAL_DOT = "#807a73";

export function languageColour(language: string | null): string {
  return (language && COLOURS[language]) || NEUTRAL_DOT;
}
