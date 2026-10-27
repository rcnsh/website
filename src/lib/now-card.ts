/**
 * The one-line listening card the GitHub profile README embeds as /now.svg.
 * Pure, so it can be tested without the Workers runtime.
 */

export type Theme = "light" | "dark";

export type NowLine =
  | { state: "playing"; title: string; artists: string }
  | { state: "repeat"; title: string; artists: string | null }
  | { state: "none" };

// GitHub's own text colours, so the line reads as part of the README.
const COLOURS: Record<Theme, { fg: string; muted: string }> = {
  light: { fg: "#1f2328", muted: "#59636e" },
  dark: { fg: "#f0f6fc", muted: "#9198a1" },
};

const SPOTIFY_GREEN = "#1db954";
const FONT_SIZE = 14;
const HEIGHT = 22;
/** Wider than the average glyph at 14px, so the box over-fits rather than clips. */
const CHAR_WIDTH = 8;
const MAX_FIELD = 48;

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clip = (s: string) => (s.length > MAX_FIELD ? `${s.slice(0, MAX_FIELD - 1)}…` : s);

/** Label, then the parts after it, the emphasised ones in the foreground colour. */
function segments(line: NowLine): { text: string; strong?: boolean }[] {
  switch (line.state) {
    case "playing":
      return [
        { text: "listening now: " },
        { text: clip(line.title), strong: true },
        { text: " by " },
        { text: clip(line.artists), strong: true },
      ];
    case "repeat":
      return [
        { text: "on repeat: " },
        { text: clip(line.title), strong: true },
        ...(line.artists ? [{ text: " by " }, { text: clip(line.artists), strong: true }] : []),
        { text: " (last 7 days)" },
      ];
    case "none":
      return [{ text: "nothing played in the last 7 days" }];
  }
}

export function renderNowCard(line: NowLine, theme: Theme): string {
  const { fg, muted } = COLOURS[theme];
  const parts = segments(line);
  const dot = line.state === "playing";
  const textX = dot ? 16 : 0;
  const chars = parts.reduce((n, p) => n + p.text.length, 0);
  const width = Math.ceil(textX + chars * CHAR_WIDTH);

  const spans = parts
    .map((p) => `<tspan fill="${p.strong ? fg : muted}">${escapeXml(p.text)}</tspan>`)
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img">`,
    `<title>${escapeXml(parts.map((p) => p.text).join(""))}</title>`,
    dot
      ? `<circle cx="5" cy="${HEIGHT / 2}" r="4" fill="${SPOTIFY_GREEN}"><animate attributeName="opacity" values="1;0.35;1" dur="2s" repeatCount="indefinite"/></circle>`
      : "",
    `<text x="${textX}" y="${HEIGHT / 2}" dominant-baseline="central" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif" font-size="${FONT_SIZE}">${spans}</text>`,
    "</svg>",
  ].join("");
}
