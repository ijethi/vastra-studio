import type { GarmentAnalysis, GateVerdict } from "@/lib/db/schema";

export interface VisionProvider {
  readonly name: string;
  /** Classify the garment photo and flag unusable uploads before credits are spent. */
  analyzeGarment(garmentImage: Buffer): Promise<GarmentAnalysis>;
  /** Score a generated image against the garment photo. */
  assessOutput(args: { garmentImage: Buffer; outputImage: Buffer; analysis: GarmentAnalysis | null }): Promise<GateVerdict>;
}

/** Minimum score for an image to be shown to the owner. */
export const GATE_THRESHOLD = 0.7;
