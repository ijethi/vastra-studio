import sharp from "sharp";
import type { GarmentCategory } from "@/lib/db/schema";
import { boxOf, maskPixels, rgbaFromAlpha } from "@/lib/providers/segment/mask";
import type { MaskBox } from "@/lib/providers/segment/types";
import { PERSON_CANVAS } from "./types";

export type PlacedGarment = {
  /** RGBA PNG, canvas size: the cut-out scaled and positioned, transparent elsewhere. */
  layer: Buffer;
  /** Greyscale PNG, canvas size: the feathered garment mask in canvas coordinates. */
  canvasMask: Buffer;
  placement: MaskBox;
};

/**
 * Scale the cut-out so the garment sits where it would on a standing figure
 * (neckline near the shoulders for tops and one-pieces, waist for bottoms)
 * and centre it on the canvas. Both the mock generator and the Gemini
 * generator use this so the garment ends up at a known place that can be
 * re-pasted and checked.
 */
export async function placeGarment(cutout: Buffer, mask: Buffer, category: GarmentCategory, canvas = PERSON_CANVAS): Promise<PlacedGarment> {
  const meta = await sharp(cutout).metadata();
  const srcW = meta.width ?? 0, srcH = meta.height ?? 0;
  const pixels = await maskPixels(mask, srcW, srcH);
  let box = boxOf(pixels, srcW, srcH, 40);
  if (box.width < 4 || box.height < 4) box = { left: 0, top: 0, width: srcW, height: srcH };

  const fullLength = category === "one-piece" || category === "set" || category === "saree" || category === "lehenga";
  const targetH = Math.round(canvas.height * (fullLength ? 0.7 : category === "bottom" ? 0.46 : 0.4));
  const top = Math.round(canvas.height * (category === "bottom" ? 0.46 : 0.235));
  let scale = targetH / box.height;
  // Wide pieces (kaftans, dupattas spread out) must still fit the frame.
  scale = Math.min(scale, (canvas.width * 0.92) / box.width);
  const w = Math.max(1, Math.round(box.width * scale));
  const h = Math.max(1, Math.round(box.height * scale));
  const left = Math.round((canvas.width - w) / 2);
  const placement: MaskBox = { left, top, width: w, height: h };

  const cropped = sharp(cutout).extract(box).resize(w, h, { fit: "fill", kernel: "lanczos3" });
  const layer = await sharp({ create: { width: canvas.width, height: canvas.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await cropped.png().toBuffer(), left, top }])
    .png({ compressionLevel: 6 })
    .toBuffer();
  const maskCrop = await sharp(mask).extract(box).resize(w, h, { fit: "fill", kernel: "lanczos3" }).toColourspace("b-w").png().toBuffer();
  const canvasMask = await sharp({ create: { width: canvas.width, height: canvas.height, channels: 3, background: "#000" } })
    .composite([{ input: maskCrop, left, top }])
    .toColourspace("b-w")
    .png({ compressionLevel: 6 })
    .toBuffer();
  return { layer, canvasMask, placement };
}

/** Soft drop shadow for a placed garment: the mask blurred, darkened and offset. */
export async function softShadow(canvasMask: Buffer, opts: { dx?: number; dy?: number; blur?: number; opacity?: number } = {}): Promise<Buffer> {
  const { dx = 8, dy = 14, blur = 14, opacity = 0.32 } = opts;
  const meta = await sharp(canvasMask).metadata();
  const width = meta.width ?? PERSON_CANVAS.width, height = meta.height ?? PERSON_CANVAS.height;
  // Two passes: sharp applies extract before extend within one pipeline, so the shift needs its own step.
  const shifted = await sharp(canvasMask)
    .toColourspace("b-w")
    .linear(opacity, 0)
    .blur(blur)
    .extend({ top: Math.max(0, dy), left: Math.max(0, dx), bottom: Math.max(0, -dy), right: Math.max(0, -dx), background: "#000" })
    .toColourspace("b-w")
    .png()
    .toBuffer();
  const alpha = await sharp(shifted).extract({ left: 0, top: 0, width, height }).toColourspace("b-w").raw().toBuffer();
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = 20;
    rgb[i + 1] = 14;
    rgb[i + 2] = 10;
  }
  return rgbaFromAlpha(rgb, alpha, width, height);
}

/**
 * Re-paste the original garment pixels over a generated image through the
 * feathered mask. The layer already carries the mask as alpha, so a plain
 * "over" composite keeps the garment exact and blends only the edge pixels.
 */
export async function pasteGarmentExact(generated: Buffer, placed: PlacedGarment, canvas = PERSON_CANVAS): Promise<Buffer> {
  return sharp(generated)
    .rotate()
    .resize(canvas.width, canvas.height, { fit: "cover", position: "centre" })
    .composite([{ input: placed.layer, left: 0, top: 0 }])
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();
}
