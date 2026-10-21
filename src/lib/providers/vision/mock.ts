import sharp from "sharp";
import type { GarmentAnalysis, GateVerdict } from "@/lib/db/schema";
import type { VisionProvider } from "./types";

function hashBuffer(buf: Buffer): number {
  let h = 2166136261;
  const step = Math.max(1, Math.floor(buf.length / 4096));
  for (let i = 0; i < buf.length; i += step) h = Math.imul(h ^ buf[i], 16777619);
  return h >>> 0;
}

/** Deterministic stand-in so the pipeline is testable offline. */
export class MockVisionProvider implements VisionProvider {
  readonly name = "mock";

  async analyzeGarment(garmentImage: Buffer): Promise<GarmentAnalysis> {
    const meta = await sharp(garmentImage).metadata();
    const stats = await sharp(garmentImage).resize(64, 64, { fit: "inside" }).stats();
    const [r, g, b] = stats.channels.map((c) => Math.round(c.mean));
    const colour = describeColour(r, g, b);
    const tooSmall = (meta.width ?? 0) < 400 || (meta.height ?? 0) < 400;
    const tooDark = (r + g + b) / 3 < 35;
    const issues: string[] = [];
    if (tooSmall) issues.push("Photo is very small; use at least 1000 px on the long side.");
    if (tooDark) issues.push("Photo is very dark; shoot near a window or under even light.");
    const portrait = (meta.height ?? 1) >= (meta.width ?? 1);
    return {
      category: portrait ? "one-piece" : "top",
      title: `${colour} ${portrait ? "suit set" : "top"}`,
      colour,
      secondaryColours: [],
      sleeve: null,
      length: portrait ? "full" : null,
      neckline: null,
      fabricGuess: null,
      print: null,
      usable: issues.length === 0,
      issues,
      confidence: 0.4,
    };
  }

  async assessOutput({ outputImage }: { garmentImage: Buffer; outputImage: Buffer; analysis: GarmentAnalysis | null }): Promise<GateVerdict> {
    const h = hashBuffer(outputImage);
    // Roughly 1 in 12 fails so the retry path is exercised in development.
    const fail = h % 12 === 0;
    const score = fail ? 0.42 + (h % 20) / 100 : 0.78 + (h % 18) / 100;
    return {
      pass: !fail,
      score: Math.round(score * 100) / 100,
      reasons: fail ? ["Garment edges look misaligned with the body (mock verdict)"] : [],
      checks: { colourMatch: !fail, lengthMatch: true, anatomy: true, faceIntact: true, noArtefacts: !fail, safe: true },
    };
  }
}

function describeColour(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max - min < 24) return l > 200 ? "Ivory" : l > 120 ? "Grey" : "Black";
  const hue = (() => {
    const d = max - min;
    let h = 0;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return ((h * 60) + 360) % 360;
  })();
  if (hue < 15 || hue >= 345) return "Red";
  if (hue < 40) return "Rust";
  if (hue < 65) return "Mustard";
  if (hue < 160) return "Green";
  if (hue < 200) return "Teal";
  if (hue < 260) return "Blue";
  if (hue < 300) return "Purple";
  return "Pink";
}
