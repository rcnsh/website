import satori from "satori";
import sharp from "sharp";
import { LOGO_ASPECT, LOGO_LIFTED, logoSvg } from "./logo.ts";
import { loadFonts } from "./og.ts";

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

type Node = {
  type: string;
  props: Record<string, unknown> & { children?: unknown };
};

const el = (
  type: string,
  props: Record<string, unknown>,
  children?: unknown,
): Node => ({ type, props: { ...props, children } });

export async function renderBadge(scale = 1): Promise<Buffer> {
  const px = (value: number) => value * scale;

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
          border: `${px(1)}px solid ${COLOR.line}`,
        },
      },
      [
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
            el(
              "div",
              {
                style: {
                  display: "flex",
                  fontFamily: "Geist Mono",
                  fontWeight: 700,
                  fontSize: px(11),
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
