import { boxOf, finaliseMask, inputSize, kmeans, labImage, labDistance, refineGarmentMask, toWorkingRgb, writeDebug, WORK_SIZE } from "./mask";
import type { GarmentSegmenter, SegmentResult } from "./types";

/**
 * Pure-sharp fallback when the ONNX model cannot run. Colour-based: the
 * garment palette is learnt from the centre of the photo and the background
 * palette from its border, every pixel is scored by which palette it is
 * closer to in Lab, and the blob around the centre is kept.
 *
 * Limitation: it cannot separate the garment from background of a similar
 * colour, and busy shop backgrounds with many colours leak in around the
 * edges. Good enough for plain or softly blurred backgrounds; the model is
 * strongly preferred for real shop photos.
 */
export class HeuristicSegmenter implements GarmentSegmenter {
  readonly name = "heuristic";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async segment(image: Buffer): Promise<SegmentResult> {
    const target = await inputSize(image);
    const work = await toWorkingRgb(image, WORK_SIZE);
    const { width, height } = work;
    const lab = labImage(work);
    const at = (i: number): [number, number, number] => [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]];

    // Garment samples: the central third. Background samples: a frame along the border.
    const garmentSamples: Array<[number, number, number]> = [];
    const bgSamples: Array<[number, number, number]> = [];
    const border = Math.max(2, Math.round(Math.min(width, height) * 0.06));
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const i = y * width + x;
        const inCentre = x > width * 0.33 && x < width * 0.67 && y > height * 0.25 && y < height * 0.75;
        const onBorder = x < border || y < border || x >= width - border || y >= height - border;
        if (inCentre) garmentSamples.push(at(i));
        else if (onBorder) bgSamples.push(at(i));
      }
    }
    const garmentPalette = kmeans(garmentSamples, 3);
    const bgPalette = kmeans(bgSamples, 5);

    const mask = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const p = at(i);
      let dG = Infinity, dB = Infinity;
      for (const c of garmentPalette) dG = Math.min(dG, labDistance(p, c));
      for (const c of bgPalette) dB = Math.min(dB, labDistance(p, c));
      // Soft membership; a garment pixel is one that is clearly closer to the garment palette.
      const score = dB / (dG + dB + 1e-6);
      mask[i] = Math.max(0, Math.min(255, Math.round((score - 0.35) / 0.3 * 255)));
    }

    const refined = refineGarmentMask(work, mask);
    const result = await finaliseMask(refined.mask, work, target, this.name);
    if (result.bbox.width === 0) {
      // Nothing found: fall back to the central region so downstream code has something to work with.
      const fallback = new Uint8Array(width * height);
      for (let y = Math.round(height * 0.08); y < height * 0.92; y++) for (let x = Math.round(width * 0.2); x < width * 0.8; x++) fallback[y * width + x] = 255;
      return finaliseMask(fallback, work, target, `${this.name}-fallback`);
    }
    await writeDebug({ "segment-heuristic-mask.png": result.mask });
    return result;
  }
}

export { boxOf };
