export type MaskBox = { left: number; top: number; width: number; height: number };

export type SegmentResult = {
  /** 8-bit greyscale PNG the size of the input: 255 = garment, 0 = everything else, soft edges. */
  mask: Buffer;
  width: number;
  height: number;
  /** Tight box around the garment (mask above 25%), in input pixels. */
  bbox: MaskBox;
  /** Share of the image the garment covers, 0..1. */
  coverage: number;
  /** Which implementation produced the mask. */
  segmenter: string;
};

/**
 * Finds the garment in a shop photo and returns a soft alpha mask. Background,
 * mannequin body parts and the stand should be outside the mask so the pixels
 * inside it can be kept exactly in the final image.
 */
export interface GarmentSegmenter {
  readonly name: string;
  /** False when the implementation cannot run here (missing native module, no model). */
  isAvailable(): Promise<boolean>;
  segment(image: Buffer): Promise<SegmentResult>;
}

export class SegmentError extends Error {
  constructor(
    public segmenter: string,
    message: string,
  ) {
    super(`[segment:${segmenter}] ${message}`);
  }
}
