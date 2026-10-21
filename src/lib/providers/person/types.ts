import type { AgeRange, BodyType, SkinTone } from "@/lib/base-models/catalog";
import type { GarmentCategory } from "@/lib/db/schema";
import type { MaskBox } from "@/lib/providers/segment/types";

/** Canvas every person generator works on: 2:3 portrait, the app's output size. */
export const PERSON_CANVAS = { width: 864, height: 1296 } as const;

export type PersonHints = {
  bodyType: BodyType;
  skinTone: SkinTone;
  ageRange: AgeRange;
  /** Backdrop id from the catalogue (e.g. "studio-ivory"). */
  backdrop: string;
  seed: number;
};

export type PersonGenInput = {
  /** RGBA PNG: the garment with everything else transparent, in the source photo's frame. */
  garmentCutout: Buffer;
  /** Greyscale PNG the size of the cut-out: 255 = garment. */
  garmentMask: Buffer;
  hints: PersonHints;
  category: GarmentCategory;
  /** Optional pre-rendered base model on the requested backdrop (dev placeholder or library image). */
  baseModelImage?: Buffer;
  timeoutMs: number;
};

export type PersonGenOutput = {
  /** JPEG, PERSON_CANVAS size. The garment pixels inside `placement` are the originals. */
  image: Buffer;
  width: number;
  height: number;
  /** Where the cut-out was placed on the canvas; the exact-match check compares this region. */
  placement: MaskBox;
  /** Mask in canvas coordinates (greyscale PNG, canvas size). */
  canvasMask: Buffer;
  seed: number;
  provider: string;
  costUsd?: number;
};

/**
 * Exact-garment mode: draws a person and a backdrop around a garment cut-out,
 * then keeps the garment pixels exactly. For mannequin photos, where the
 * garment is already shaped like a body, this beats try-on's re-rendering.
 */
export interface PersonGenerator {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  generate(input: PersonGenInput): Promise<PersonGenOutput>;
}

export class PersonProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public retryable: boolean,
    public status?: number,
  ) {
    super(`[${provider}] ${message}`);
  }
}
