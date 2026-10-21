import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import sharp from "sharp";
import { z } from "zod";
import { env } from "@/env";
import type { GarmentAnalysis, GateVerdict } from "@/lib/db/schema";
import type { VisionProvider } from "./types";
import { GATE_THRESHOLD } from "./types";

const MODEL = "claude-opus-5-5";

const AnalysisSchema = z.object({
  category: z.enum(["top", "bottom", "one-piece", "set", "saree", "lehenga", "unknown"]),
  photoType: z.enum(["mannequin", "flat-lay", "hanger", "on-model"]).describe("How the garment was photographed: on a mannequin or dress form, laid flat, on a hanger, or worn by a person"),
  title: z.string().describe("Short product title a boutique would use, e.g. 'Emerald chikankari kurta set'"),
  colour: z.string(),
  secondaryColours: z.array(z.string()),
  sleeve: z.string().nullable(),
  length: z.string().nullable(),
  neckline: z.string().nullable(),
  fabricGuess: z.string().nullable(),
  print: z.string().nullable(),
  usable: z.boolean().describe("False if blurry, too dark, garment cropped, several garments, or not a garment"),
  issues: z
    .array(z.string())
    .describe("Tips for the photographer, each one short sentence with the problem and the fix, e.g. 'A bit dark. Move nearer a window if you can.' Empty when nothing needs fixing"),
  confidence: z.number().min(0).max(1),
});

const VerdictSchema = z.object({
  colourMatch: z.boolean(),
  printMatch: z.boolean(),
  lengthMatch: z.boolean(),
  sleeveMatch: z.boolean(),
  anatomy: z.boolean().describe("Hands, limbs and proportions look natural; no extra limbs"),
  faceIntact: z.boolean(),
  noArtefacts: z.boolean().describe("No smearing, floating fabric, text artefacts or seams"),
  embroideryPreserved: z.boolean().describe("Embroidery, zari, sequins and border work stay crisp and in the same places as the upload"),
  setPiecesConsistent: z.boolean().describe("For sets: kurta, bottom and dupatta keep the same fabric, colour and print; dupatta drape looks natural"),
  sameGarment: z.boolean().describe("This is the uploaded garment, not a similar or prettier different garment"),
  lightingConsistent: z.boolean(),
  safe: z.boolean().describe("No nudity, minors, hate symbols or real-person likeness"),
  score: z.number().min(0).max(1).describe("Overall: would a shopper believe this is a studio photo?"),
  reasons: z.array(z.string()).describe("Specific failures, empty when the image passes"),
});

const ANALYSIS_SYSTEM = `You are the intake inspector for a virtual try-on studio used by Indian boutiques.
You look at one photo of a garment (flat-lay, on a hanger, or on a mannequin) and describe it so the
try-on model can be configured and the owner gets a sensible product title. Categories: top (kurta, blouse,
shirt), bottom (palazzo, trousers, skirt), one-piece (dress, anarkali, gown, kurta with attached bottom),
set (kurta + bottom + dupatta photographed together), saree, lehenga. Also say how it was photographed
(photoType): mannequin (dress form or mannequin, with or without a head), flat-lay (laid on a surface),
hanger, or on-model (worn by a person). Mark the photo unusable when it is blurry, very dark, the garment
is cut off, several unrelated garments are shown, or it is not clothing. Busy shop backgrounds and warm
indoor light are handled by the app and are not issues.
Issues are friendly tips for a shop owner using a phone: one short sentence each, a plain reason then a
suggestion, for example "A bit dark. Move nearer a window if you can." or "The hem is cut off. Step back so
the whole piece is in the frame." No jargon, no pixel sizes.`;

const GATE_SYSTEM = `You are the quality gate for a virtual try-on studio. The first image is the garment photo
the boutique uploaded; the second is an AI-generated image of a model wearing it. Judge whether the second
image is sellable at Instagram size: colour and print match the upload, correct garment length and sleeves,
natural anatomy and hands, the model's face intact, no smearing or artefacts, lighting consistent, and
nothing unsafe. The boutiques sell Indian wear: pay particular attention to embroidery, zari and border work,
dupatta drape, and whether matching set pieces kept their fabric and print. A beautiful image of a different
garment is a failure. Score 1.0 only if a shopper could not tell it from a studio photo of this exact garment.`;

/**
 * Claude vision for garment analysis and the output quality gate.
 * Images are downscaled before sending to keep token cost low.
 */
export class ClaudeVisionProvider implements VisionProvider {
  readonly name = "claude";
  private client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY || undefined });

  private async toImageBlock(buf: Buffer): Promise<Anthropic.ImageBlockParam> {
    const data = (await sharp(buf).rotate().resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer()).toString("base64");
    return { type: "image", source: { type: "base64", media_type: "image/jpeg", data } };
  }

  async analyzeGarment(garmentImage: Buffer): Promise<GarmentAnalysis> {
    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      system: ANALYSIS_SYSTEM,
      output_config: { format: zodOutputFormat(AnalysisSchema), effort: "low" },
      messages: [
        {
          role: "user",
          content: [await this.toImageBlock(garmentImage), { type: "text", text: "Describe this garment photo." }],
        },
      ],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return {
        category: "unknown",
        photoType: "flat-lay",
        title: "Untitled piece",
        colour: "",
        secondaryColours: [],
        sleeve: null,
        length: null,
        neckline: null,
        fabricGuess: null,
        print: null,
        usable: false,
        issues: ["The photo could not be analysed. Please upload a clear photo of a single garment."],
        confidence: 0,
      };
    }
    return response.parsed_output;
  }

  async assessOutput({ garmentImage, outputImage, analysis }: { garmentImage: Buffer; outputImage: Buffer; analysis: GarmentAnalysis | null }): Promise<GateVerdict> {
    const hint = analysis ? `Garment analysis: ${JSON.stringify(analysis)}` : "";
    const response = await this.client.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      system: GATE_SYSTEM,
      output_config: { format: zodOutputFormat(VerdictSchema), effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Garment photo:" },
            await this.toImageBlock(garmentImage),
            { type: "text", text: "Generated image:" },
            await this.toImageBlock(outputImage),
            { type: "text", text: `${hint}\nJudge the generated image.` },
          ],
        },
      ],
    });
    const v = response.parsed_output;
    if (response.stop_reason === "refusal" || !v) {
      return { pass: false, score: 0, reasons: ["Quality gate could not assess the image"], checks: { safe: false } };
    }
    const { score, reasons, ...checks } = v;
    const pass = score >= GATE_THRESHOLD && checks.safe && checks.faceIntact && checks.anatomy && checks.sameGarment;
    return { pass, score, reasons, checks };
  }
}
