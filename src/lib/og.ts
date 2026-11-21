import { readFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";
import { loadPalette } from "./palette.ts";

export const OG_COLOR = loadPalette({
  base: "base",
  line: "line",
  ink: "ink",
  inkDim: "ink-dim",
  inkFaint: "ink-faint",
  brand: "brand",
});

const WIDTH = 1200;
const HEIGHT = 630;

const FONT_FILES = {
  sans: "Geist-Regular.ttf",
  mono: "GeistMono-Regular.ttf",
  monoBold: "GeistMono-Bold.ttf",
} as const;

export type Font = {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
};

let fontsPromise: Promise<Font[]> | null = null;

export function loadFonts(): Promise<Font[]> {
  fontsPromise ??= (async () => {
    const dir = path.join(process.cwd(), "src/assets/fonts");
    const [sans, mono, monoBold] = await Promise.all(
      [FONT_FILES.sans, FONT_FILES.mono, FONT_FILES.monoBold].map((file) =>
        readFile(path.join(dir, file)),
      ),
    );

    return [
      { name: "Geist", data: sans!, weight: 400, style: "normal" },
      { name: "Geist Mono", data: mono!, weight: 400, style: "normal" },
      { name: "Geist Mono", data: monoBold!, weight: 700, style: "normal" },
    ];
  })();

  return fontsPromise;
}

function truncate(text: string, limit: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= limit) return clean;

  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

type Node = {
  type: string;
  props: { style?: Record<string, unknown>; children?: unknown };
};

const el = (
  type: string,
  style: Record<string, unknown>,
  children?: unknown,
): Node => ({ type, props: { style, children } });

export type OgCard = {
  title: string;
  description?: string;
  meta?: string[];
};

export async function renderOgImage(card: OgCard): Promise<ArrayBuffer> {
  const title = truncate(card.title, 90);
  const description = card.description ? truncate(card.description, 155) : null;

  const svg = await satori(
    el(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: OG_COLOR.base,
        padding: "68px 76px",
        fontFamily: "Geist",
      },
      [
        el("div", { display: "flex" }, [
          el(
            "div",
            {
              display: "flex",
              borderBottom: `2px solid ${OG_COLOR.brand}`,
              paddingBottom: 10,
              fontFamily: "Geist Mono",
              fontSize: 26,
              letterSpacing: "-0.02em",
            },
            [
              el("span", { color: OG_COLOR.ink }, "rcn"),
              el("span", { color: OG_COLOR.inkFaint }, ".sh"),
            ],
          ),
        ]),

        el(
          "div",
          {
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            paddingTop: 24,
            paddingBottom: 24,
          },
          [
            el(
              "div",
              {
                fontFamily: "Geist Mono",
                fontWeight: 700,
                fontSize: title.length > 48 ? 54 : 68,
                letterSpacing: "-0.04em",
                lineHeight: 1.08,
                color: OG_COLOR.ink,
              },
              title,
            ),

            description
              ? el(
                  "div",
                  {
                    marginTop: 26,
                    fontSize: 27,
                    lineHeight: 1.5,
                    color: OG_COLOR.inkDim,
                  },
                  description,
                )
              : null,
          ],
        ),

        el(
          "div",
          {
            display: "flex",
            alignItems: "center",
            gap: 14,
            borderTop: `1px solid ${OG_COLOR.line}`,
            paddingTop: 26,
            fontFamily: "Geist Mono",
            fontSize: 21,
            letterSpacing: "0.02em",
            color: OG_COLOR.inkFaint,
          },
          (card.meta ?? []).flatMap((part, index) =>
            index === 0
              ? [el("span", {}, part)]
              : [el("span", {}, "·"), el("span", {}, part)],
          ),
        ),
      ],
    ) as unknown as React.ReactNode,
    { width: WIDTH, height: HEIGHT, fonts: await loadFonts() },
  );

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return png.buffer.slice(
    png.byteOffset,
    png.byteOffset + png.byteLength,
  ) as ArrayBuffer;
}

export const OG_SIZE = { width: WIDTH, height: HEIGHT } as const;
