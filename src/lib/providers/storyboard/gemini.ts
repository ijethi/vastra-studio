import sharp from "sharp";
import { env } from "@/env";
import { SCENES, vibeInfo } from "@/lib/reels/scenes";
import { describeGarment } from "@/lib/providers/video/prompts";
import { STILL_HEIGHT, STILL_WIDTH, StoryboardProviderError, type StoryboardInput, type StoryboardProvider, type StoryboardStill } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

const FRAMING: Record<string, string> = {
  "wide-hook": "wide shot, the whole figure small in a rich environment",
  "full-body": "full-length shot, head to feet in frame, hem and shoes visible",
  movement: "full-length shot caught mid-motion",
  detail: "close-up on the garment's fabric and details",
  "hero-portrait": "head-and-shoulders portrait, the garment's neckline and sleeves visible",
};

/**
 * Scene stills from the Gemini image model through the Interactions API
 * (the call shape used by person/gemini.ts). One request per scene, with the
 * hero image as the reference for the woman and the garment. The vision gate
 * judges every still afterwards, so a scene that repaints the garment is
 * dropped and refunded rather than shown.
 */
export class GeminiStoryboardProvider implements StoryboardProvider {
  readonly name = "gemini";

  async isAvailable(): Promise<boolean> {
    return Boolean(env.GEMINI_API_KEY);
  }

  async generate(input: StoryboardInput): Promise<StoryboardStill[]> {
    if (!env.GEMINI_API_KEY) throw new StoryboardProviderError(this.name, "GEMINI_API_KEY not set", false);
    const scenes = SCENES[input.vibe].slice(0, Math.max(1, input.count));
    const hero = await sharp(input.heroImage).rotate().resize(1024, 1536, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
    const garment = describeGarment(input.garmentAnalysis, input.garmentTitle);
    const mood = vibeInfo(input.vibe).mood;
    const out: StoryboardStill[] = [];
    let lastError: unknown;
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const text = [
        "Photoreal fashion still for an Indian boutique's Instagram reel.",
        `The woman in image 1 is the subject, wearing ${garment}. Keep the garment exactly as in image 1: same colour, print, embroidery, borders, neckline, sleeves and length. Do not restyle, recolour or redesign it.`,
        `Scene: she is ${scene.prompt}.`,
        `Framing: ${FRAMING[scene.shotType]}. Mood: ${mood}.`,
        "Vertical 9:16, natural hands and anatomy, no text, no logos, no watermark, no other people.",
      ].join(" ");
      const body = {
        model: env.GEMINI_IMAGE_MODEL,
        input: [
          { type: "text", text },
          { type: "text", text: "Image 1, the reference for the woman and the exact garment:" },
          { type: "image", mime_type: "image/jpeg", data: hero.toString("base64") },
        ],
        response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "9:16", image_size: "1K", delivery: "inline" },
        generation_config: { seed: i + 1 },
        store: false,
      };
      try {
        const b64 = await this.call(body, input.timeoutMs);
        const image = await sharp(Buffer.from(b64, "base64")).resize(STILL_WIDTH, STILL_HEIGHT, { fit: "cover", position: "attention" }).jpeg({ quality: 92 }).toBuffer();
        out.push({ image, width: STILL_WIDTH, height: STILL_HEIGHT, sceneLabel: scene.label, shotType: scene.shotType, prompt: scene.prompt, provider: this.name, seed: i + 1, costUsd: 0.04 });
      } catch (err) {
        lastError = err;
        if (err instanceof StoryboardProviderError && !err.retryable && /API key|not set|403|401/.test(err.message)) throw err;
        console.warn(`[storyboard] gemini scene "${scene.label}" failed:`, (err as Error).message);
      }
      await input.onStill?.(i + 1, scenes.length);
    }
    if (out.length === 0) {
      throw lastError instanceof StoryboardProviderError ? lastError : new StoryboardProviderError(this.name, (lastError as Error)?.message ?? "every scene failed", true);
    }
    return out;
  }

  private async call(body: unknown, timeoutMs: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "x-goog-api-key": env.GEMINI_API_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new StoryboardProviderError(this.name, `interactions failed: ${res.status} ${t.slice(0, 300)}`, res.status >= 500 || res.status === 429, res.status);
      }
      const json = (await res.json()) as InteractionResponse;
      const b64 = extractImage(json);
      if (!b64) {
        const reason = json.errors?.map((e) => e.message).join("; ") || json.status || "no image in response";
        throw new StoryboardProviderError(this.name, `no image returned (${reason})`, false);
      }
      return b64;
    } catch (err) {
      if (err instanceof StoryboardProviderError) throw err;
      throw new StoryboardProviderError(this.name, (err as Error).message, true);
    } finally {
      clearTimeout(timer);
    }
  }
}

type InteractionResponse = {
  id?: string;
  status?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string; mime_type?: string }> }>;
  output_image?: { data?: string };
  errors?: Array<{ code?: string; message?: string }>;
};

function extractImage(json: InteractionResponse): string | null {
  if (json.output_image?.data) return json.output_image.data;
  for (const step of json.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content ?? []) {
      if (block.type === "image" && block.data) return block.data;
    }
  }
  return null;
}
