import { readFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";

/**
 * Share cards, drawn ahead of the build by scripts/generate-og.mjs.
 *
 * satori lays the card out with a flexbox subset and returns SVG; sharp
 * rasterises it. Both are Node-only, and the Cloudflare adapter prerenders
 * inside workerd rather than Node — so this cannot be an Astro endpoint, and
 * the script writes straight into public/ instead. Nothing here ever reaches
 * the Worker; by deploy time the cards are ordinary static assets.
 *
 * Deliberately free of `@/` imports so plain `node scripts/…` can load it.
 *
 * The palette repeats the tokens in styles/global.css rather than importing
 * them, since satori resolves no custom properties. They want changing
 * together; there are only six.
 */

const COLOR = {
  base: "#0d0d0c",
  line: "#262420",
  ink: "#e8e3d9",
  inkDim: "#a09a8f",
  inkFaint: "#6d675e",
  brand: "#7f8ad0",
} as const;

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Static instances of the two faces the site uses. The Fontsource packages
 * that dress the site itself ship woff2, which satori cannot parse, so these
 * are vendored as TrueType alongside.
 */
const FONT_FILES = {
  sans: "Geist-Regular.ttf",
  mono: "GeistMono-Regular.ttf",
  monoBold: "GeistMono-Bold.ttf",
} as const;

type Font = { name: string; data: Buffer; weight: 400 | 700; style: "normal" };

// Read once per build rather than once per card.
let fontsPromise: Promise<Font[]> | null = null;

function loadFonts(): Promise<Font[]> {
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

/**
 * satori has no line clamp, so long strings are cut here instead. The limits
 * are per-card maxima that keep the block inside its box at the sizes below.
 */
function truncate(text: string, limit: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= limit) return clean;

  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/*
  satori takes React elements, but only reads `type`, `props.style` and
  `props.children` — so plain objects do, and the module stays free of JSX and
  of React itself.
*/
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
  /** The metadata line along the bottom, e.g. date and reading time. */
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
        backgroundColor: COLOR.base,
        padding: "68px 76px",
        fontFamily: "Geist",
      },
      [
        /*
          Wordmark in the header's two-tone treatment, over the header's own
          active-tab underline — 2px of brand, sized to the text. The site
          spends its one accent colour only on marking something, and keeps
          every rule to a hairline, so the card does the same.
        */
        el("div", { display: "flex" }, [
          el(
            "div",
            {
              display: "flex",
              borderBottom: `2px solid ${COLOR.brand}`,
              paddingBottom: 10,
              fontFamily: "Geist Mono",
              fontSize: 26,
              letterSpacing: "-0.02em",
            },
            [
              el("span", { color: COLOR.ink }, "rcn"),
              el("span", { color: COLOR.inkFaint }, ".sh"),
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
                // Long titles step down a size rather than overflowing.
                fontSize: title.length > 48 ? 54 : 68,
                letterSpacing: "-0.04em",
                lineHeight: 1.08,
                color: COLOR.ink,
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
                    color: COLOR.inkDim,
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
            borderTop: `1px solid ${COLOR.line}`,
            paddingTop: 26,
            fontFamily: "Geist Mono",
            fontSize: 21,
            letterSpacing: "0.02em",
            color: COLOR.inkFaint,
          },
          // Interleaved with the separator the rest of the site uses.
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

  /*
    Node hands back a Buffer, which is a view onto a pooled ArrayBuffer that
    other allocations share — handing that pool to Response would send far
    more than this image. Copy out the slice the PNG actually occupies.
  */
  return png.buffer.slice(
    png.byteOffset,
    png.byteOffset + png.byteLength,
  ) as ArrayBuffer;
}

export const OG_SIZE = { width: WIDTH, height: HEIGHT } as const;
