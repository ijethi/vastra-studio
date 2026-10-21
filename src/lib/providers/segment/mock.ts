import sharp from "sharp";
import { boxOf, inputSize } from "./mask";
import type { GarmentSegmenter, SegmentResult } from "./types";

/**
 * Deterministic stand-in for tests and offline runs: a soft rounded rectangle
 * over the middle of the photo, where a garment on a mannequin or hanger
 * usually sits. Fast and dependency-free.
 */
export class MockSegmenter implements GarmentSegmenter {
  readonly name = "mock";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async segment(image: Buffer): Promise<SegmentResult> {
    const { width, height } = await inputSize(image);
    const left = Math.round(width * 0.22), top = Math.round(height * 0.1);
    const w = Math.round(width * 0.56), h = Math.round(height * 0.82);
    const r = Math.round(Math.min(w, h) * 0.12);
    const svg = Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="black"/><rect x="${left}" y="${top}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/></svg>`,
    );
    const raw = await sharp(svg).blur(2).toColourspace("b-w").raw().toBuffer();
    const pixels = new Uint8Array(raw.buffer, raw.byteOffset, raw.length);
    const mask = await sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer();
    let sum = 0;
    for (let i = 0; i < pixels.length; i++) sum += pixels[i];
    return { mask, width, height, bbox: boxOf(pixels, width, height), coverage: sum / 255 / pixels.length, segmenter: this.name };
  }
}
