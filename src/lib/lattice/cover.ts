import { applyTone, luminance, type ToneCurve, toneCurve } from "./tone.ts";

/**
 * A cover's way onto the lattice, in order: its tone curve is measured once
 * on a fixed-size copy (`coverTone`), then the texture is drawn at the size
 * the lattice asks for (`drawCover`, sized by `coverTexels`) with that curve
 * applied. The shader takes it from there: each triangle averages nine taps
 * of it (`coverMean`), drops out darkest first in the dissolve band, and is
 * ordered-dithered to one of the five levels. The curve is taken apart from
 * the texture so a resize, which redraws the texture, never shifts its tone.
 */

function shrink(image: HTMLImageElement, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, size, size);
  return { canvas, context };
}

/** The fixed side of the copy a cover's tone curve is measured on. */
const TONE_SAMPLE = 72;

/**
 * A cover's tone curve (`tone.ts`), measured on a fixed-size copy so it does
 * not depend on how large the texture happens to be: the picture keeps its
 * tone when the window resizes and the texture is redrawn.
 */
export function coverTone(image: HTMLImageElement): ToneCurve {
  const { context } = shrink(image, TONE_SAMPLE);
  const data = context.getImageData(0, 0, TONE_SAMPLE, TONE_SAMPLE).data;
  const lums = new Float32Array(data.length / 4);
  for (let i = 0; i < lums.length; i++) lums[i] = luminance(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
  return toneCurve(lums);
}

/**
 * The cover at `size` texels square (`coverTexels`: a few to each triangle's
 * side), so the shader's taps across a triangle add up to its mean, and
 * tone-mapped over all five levels, or a dark sleeve draws as one flat tone
 * with a few bright blobs.
 */
export function drawCover(image: HTMLImageElement, size: number, curve: ToneCurve): HTMLCanvasElement {
  const { canvas, context } = shrink(image, size);
  const pixels = context.getImageData(0, 0, size, size);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const tone = applyTone(luminance(data[i]!, data[i + 1]!, data[i + 2]!), curve);
    data[i] = data[i + 1] = data[i + 2] = Math.round(tone * 255);
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}
