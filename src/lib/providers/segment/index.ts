import "server-only";
import { env } from "@/env";
import { HeuristicSegmenter } from "./heuristic";
import { ImglySegmenter } from "./imgly";
import { MockSegmenter } from "./mock";
import type { GarmentSegmenter } from "./types";

let resolved: Promise<GarmentSegmenter> | undefined;

/**
 * The garment segmenter for this process. `SEGMENTER=auto` (default) uses the
 * bundled model when its native runtime loads and the sharp heuristic
 * otherwise; tests and e2e runs set `SEGMENTER=mock`.
 */
export function getSegmenter(): Promise<GarmentSegmenter> {
  if (!resolved) {
    resolved = (async () => {
      switch (env.SEGMENTER) {
        case "mock":
          return new MockSegmenter();
        case "heuristic":
          return new HeuristicSegmenter();
        case "imgly":
          return new ImglySegmenter();
        default: {
          const imgly = new ImglySegmenter();
          if (await imgly.isAvailable()) return imgly;
          console.warn("[segment] background-removal model unavailable; using the colour heuristic");
          return new HeuristicSegmenter();
        }
      }
    })();
  }
  return resolved;
}

export { applyMask, garmentOnNeutralCanvas, maskPixels, writeDebug, DEBUG_DIR } from "./mask";
export { SegmentError } from "./types";
export type { GarmentSegmenter, SegmentResult, MaskBox } from "./types";
