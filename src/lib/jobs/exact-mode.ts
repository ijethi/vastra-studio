import type { GarmentAnalysis, GateVerdict } from "@/lib/db/schema";
import { checkExactMatch, estimateColourCast, normaliseColourCast, type ColourCast, type ExactMatchResult } from "@/lib/images";
import type { PersonGenOutput } from "@/lib/providers/person/types";
import { applyMask, garmentOnNeutralCanvas, writeDebug } from "@/lib/providers/segment/mask";
import type { GarmentSegmenter, SegmentResult } from "@/lib/providers/segment/types";

/**
 * Everything the generation step needs from the uploaded photo, computed once
 * per job: colour-normalised photo, garment mask and cut-out, and which route
 * the garment takes. No database access, so scripts and tests can call it.
 */
export type PreparedGarment = {
  /** Lighting cast removed (JPEG). Falls back to the upload when the cast was negligible. */
  normalised: Buffer;
  cast: ColourCast;
  /** Null when segmentation failed; the job then runs the classic try-on on the whole photo. */
  segment: SegmentResult | null;
  /** RGBA PNG cut-out of the normalised photo; null when segmentation failed. */
  cutout: Buffer | null;
  /** What try-on providers receive: the cut-out on a plain card, or the normalised photo when there is no cut-out. */
  garmentForTryOn: Buffer;
  /** exact = person generator keeps the garment pixels; tryon = provider redraws the garment. */
  mode: "exact" | "tryon";
};

/** Mannequin photos take the exact route; everything else is redrawn by a try-on model. */
export function routeFor(analysis: GarmentAnalysis | null | undefined, segment: SegmentResult | null): PreparedGarment["mode"] {
  if (!segment) return "tryon";
  // A tiny or missing mask means the garment was not found; the exact route would paste a fragment.
  if (segment.coverage < 0.04) return "tryon";
  return analysis?.photoType === "mannequin" ? "exact" : "tryon";
}

export async function prepareGarment(image: Buffer, analysis: GarmentAnalysis | null | undefined, segmenter: GarmentSegmenter, opts: { debugPrefix?: string } = {}): Promise<PreparedGarment> {
  let segment: SegmentResult | null = null;
  try {
    segment = await segmenter.segment(image);
  } catch (err) {
    console.warn("[exact-mode] segmentation failed, using the whole photo:", (err as Error).message);
  }
  const cast = await estimateColourCast(image, segment?.mask ?? null);
  const normalised = await normaliseColourCast(image, cast);
  const cutout = segment ? await applyMask(normalised, segment.mask) : null;
  const garmentForTryOn = cutout && segment ? await garmentOnNeutralCanvas(cutout, segment.bbox) : normalised;
  const mode = routeFor(analysis, segment);

  const prefix = opts.debugPrefix ?? "exact";
  await writeDebug({
    [`${prefix}-01-normalised.jpg`]: normalised,
    ...(segment ? { [`${prefix}-02-mask.png`]: segment.mask } : {}),
    ...(cutout ? { [`${prefix}-03-cutout.png`]: cutout } : {}),
    [`${prefix}-04-garment-for-tryon.jpg`]: garmentForTryOn,
  });
  return { normalised, cast, segment, cutout, garmentForTryOn, mode };
}

/** Exact-match check for a person-generator output (garment at a known place). */
export function checkPersonOutput(output: PersonGenOutput): Promise<ExactMatchResult> {
  return checkExactMatch({ mode: "placed", output: output.image, garmentLayer: output.garmentLayer, canvasMask: output.canvasMask, placement: output.placement });
}

/** Exact-match check for a try-on output (garment somewhere on the body). Skipped without a cut-out. */
export async function checkTryOnOutput(output: Buffer, prepared: PreparedGarment): Promise<ExactMatchResult | null> {
  if (!prepared.cutout || !prepared.segment) return null;
  return checkExactMatch({ mode: "search", output, cutout: prepared.cutout, mask: prepared.segment.mask });
}

/** A failed mechanical check expressed as a gate verdict, so the job code treats it like any other rejection. */
export function exactMatchVerdict(result: ExactMatchResult): GateVerdict {
  return {
    pass: false,
    score: 0,
    reasons: result.reasons.length ? result.reasons : ["garment changed"],
    checks: { garmentUnchanged: false, colourMatch: result.meanDeltaE <= 6, safe: true },
  };
}
