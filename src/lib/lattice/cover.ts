import { applyTone, luminance, type ToneCurve, toneCurve } from "./tone.ts";

function shrink(image: HTMLImageElement, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, size, size);
  return { canvas, context };
}

const TONE_SAMPLE = 72;

export function coverTone(image: HTMLImageElement): ToneCurve {
  const { context } = shrink(image, TONE_SAMPLE);
  const data = context.getImageData(0, 0, TONE_SAMPLE, TONE_SAMPLE).data;
  const lums = new Float32Array(data.length / 4);
  for (let i = 0; i < lums.length; i++) lums[i] = luminance(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
  return toneCurve(lums);
}

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
