import { readFileSync } from "node:fs";
import path from "node:path";

export const PALETTE_CSS = path.join(process.cwd(), "src/styles/global.css");

export function paletteFrom<K extends string>(
  css: string,
  tokens: Record<K, string>,
): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(tokens) as K[]) {
    const name = tokens[key];
    const match = css.match(
      new RegExp(`--color-${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`),
    );
    if (!match) throw new Error(`global.css has no hex --color-${name}`);
    out[key] = match[1]!.toLowerCase();
  }
  return out;
}

export function loadPalette<K extends string>(
  tokens: Record<K, string>,
): Readonly<Record<K, string>> {
  return paletteFrom(readFileSync(PALETTE_CSS, "utf8"), tokens);
}
