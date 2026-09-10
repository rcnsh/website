import satori from "satori";
import sharp from "sharp";
import { LOGO_ASPECT, LOGO_LIFTED, logoSvg } from "./logo.ts";
import { loadFonts } from "./og.ts";

/**
 * The 88x31 button, drawn ahead of the build by scripts/generate-badge.ts —
 * a real raster, since someone else has to be able to hotlink it.
 *
 * satori then sharp, neither of which runs in workerd. No `@/` imports, so
 * plain `node scripts/…` can load it; the palette repeats styles/global.css,
 * since satori resolves no custom properties.
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

/* satori only reads `type` and `props`, so plain objects do. */
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
 * The badge at `scale`x. Measurements are in badge pixels and multiplied on the
 * way out, so 2x is the layout drawn larger rather than 1x blown up.
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
          // A badge lands on somebody else's background, any colour at all.
          border: `${px(1)}px solid ${COLOR.line}`,
        },
      },
      [
        // Mark on a plate, wordmark beside it — the header's own split.
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
            // The wordmark over the header's active-tab underline.
            el(
              "div",
              {
                style: {
                  display: "flex",
                  fontFamily: "Geist Mono",
                  fontWeight: 700,
                  fontSize: px(11),
                  // Clamp the box to the glyphs; "rcn.sh" has no descenders.
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
