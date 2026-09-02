import satori from "satori";
import sharp from "sharp";
import { LOGO_ASPECT, LOGO_LIFTED, logoSvg } from "./logo.ts";
import { loadFonts } from "./og.ts";

/**
 * The 88x31 button, drawn ahead of the build by scripts/generate-badge.ts.
 *
 * 88x31 is the one size the web ever agreed on: it is what the old link
 * exchanges, webrings and "hosted by" strips all used, and it is still what
 * people expect when they ask for a badge to put in their sidebar. So the
 * badge is a real raster at those exact pixels rather than an SVG that happens
 * to be that shape — the point is that someone else can hotlink it into a page
 * built in 2003 and have it land right.
 *
 * Same toolchain as the share cards, for the same reason: satori lays out and
 * hands back SVG with the glyphs already outlined, sharp rasterises it. Neither
 * runs inside workerd, so this is a prebuild step writing into public/ rather
 * than an Astro endpoint. See lib/og.ts.
 *
 * Deliberately free of `@/` imports so plain `node scripts/…` can load it.
 *
 * The palette repeats the tokens in styles/global.css, since satori resolves
 * no custom properties.
 */

const COLOR = {
  base: "#0d0d0c",
  raised: "#1a1917",
  line: "#3f3d3a",
  ink: "#e8e3d9",
  inkDim: "#a09a8f",
  brand: "#7f8ad0",
} as const;

export const BADGE_WIDTH = 88;
export const BADGE_HEIGHT = 31;

/*
  satori takes React elements, but only reads `type` and `props` — so plain
  objects do, and the module stays free of JSX and of React itself.
*/
type Node = {
  type: string;
  props: Record<string, unknown> & { children?: unknown };
};

const el = (
  type: string,
  props: Record<string, unknown>,
  children?: unknown,
): Node => ({ type, props: { ...props, children } });

/**
 * The badge at `scale`x.
 *
 * Every measurement below is in badge pixels and multiplied on the way out, so
 * the 2x file is the same layout drawn larger rather than the 1x file blown up
 * — text at 31px tall has no antialiasing to spare, and upscaling it loses the
 * only thing a retina copy is for.
 */
export async function renderBadge(scale = 1): Promise<Buffer> {
  const px = (value: number) => value * scale;

  // The glyph is ≈3.46:1, so its width follows from the height it is given.
  const markHeight = px(8);
  const mark = `data:image/svg+xml;base64,${Buffer.from(
    logoSvg(markHeight, LOGO_LIFTED),
  ).toString("base64")}`;

  const svg = await satori(
    el(
      "div",
      {
        style: {
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "stretch",
          backgroundColor: COLOR.base,
          // A badge lands on somebody else's background, which may be any
          // colour at all. The hairline is what keeps it a button rather than
          // a smear of near-black on their page.
          border: `${px(1)}px solid ${COLOR.line}`,
        },
      },
      [
        // Mark on a raised plate, wordmark beside it: the same split the
        // favicon and the header make, at the smallest size it survives.
        el(
          "div",
          {
            style: {
              display: "flex",
              width: px(32),
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: COLOR.raised,
              borderRight: `${px(1)}px solid ${COLOR.line}`,
            },
          },
          [
            el("img", {
              src: mark,
              width: markHeight * LOGO_ASPECT,
              height: markHeight,
              style: { display: "flex" },
            }),
          ],
        ),

        el(
          "div",
          {
            style: {
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            },
          },
          [
            // The header's wordmark, over the header's own active-tab
            // underline. One accent, spent on marking the thing you can click.
            el(
              "div",
              {
                style: {
                  display: "flex",
                  fontFamily: "Geist Mono",
                  fontWeight: 700,
                  fontSize: px(11),
                  // Mono metrics leave descender room under a word that has
                  // no descenders, which on a 31px canvas is enough to look
                  // like a mistake. Clamp the box to the glyphs.
                  lineHeight: 1,
                  letterSpacing: `${px(-0.2)}px`,
                  borderBottom: `${px(1)}px solid ${COLOR.brand}`,
                  paddingBottom: px(2),
                },
              },
              [
                el("span", { style: { color: COLOR.ink } }, "rcn"),
                el("span", { style: { color: COLOR.inkDim } }, ".sh"),
              ],
            ),
          ],
        ),
      ],
    ) as unknown as React.ReactNode,
    {
      width: BADGE_WIDTH * scale,
      height: BADGE_HEIGHT * scale,
      fonts: await loadFonts(),
    },
  );

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
