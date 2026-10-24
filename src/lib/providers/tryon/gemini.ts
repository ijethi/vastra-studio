import sharp from "sharp";
import { env } from "@/env";
import { TryOnProviderError, type TryOnInput, type TryOnOutput, type TryOnProvider } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/**
 * Gemini image model ("Nano Banana") as the try-on engine for flat-lay and
 * hanger photos: the garment photo is the reference and the model draws a
 * woman wearing exactly that piece. The exact-match gate still judges the
 * result afterwards, so drift is caught rather than shipped.
 */
export class GeminiTryOnProvider implements TryOnProvider {
  readonly name = "gemini";

  async isAvailable(): Promise<boolean> {
    return Boolean(env.GEMINI_API_KEY);
  }

  async generate(input: TryOnInput): Promise<TryOnOutput> {
    if (!env.GEMINI_API_KEY) throw new TryOnProviderError(this.name, "GEMINI_API_KEY not set", false);
    const garment = (await sharp(input.garmentImage).rotate().resize(1024, 1536, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer()).toString("base64");
    const model = (await sharp(input.modelImage).rotate().resize(1024, 1536, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()).toString("base64");

    const piece =
      input.category === "top" ? "top" : input.category === "bottom" ? "bottom" : input.category === "saree" ? "saree" : input.category === "lehenga" ? "lehenga set" : input.category === "set" ? "kurta set" : "outfit";

    const text = [
      "Photoreal full-length fashion catalogue photo for an Indian boutique.",
      `Image 1 shows the woman and the studio setting to keep: same person, same pose, same backdrop and lighting.`,
      `Image 2 is the ${piece} she must wear. Dress her in exactly this garment: identical colour, print, embroidery placement, borders, neckline, sleeve length and hem length. Do not restyle, recolour, simplify or redesign it; do not add or remove pieces.`,
      "Natural drape for the fabric's weight, natural hands and anatomy, face unchanged. 2:3 portrait, head to feet in frame.",
      "No text, no logos, no watermark, no other people.",
    ].join(" ");

    const body = {
      model: env.GEMINI_IMAGE_MODEL,
      input: [
        { type: "text", text },
        { type: "text", text: "Image 1, the woman and setting:" },
        { type: "image", mime_type: "image/jpeg", data: model },
        { type: "text", text: "Image 2, the exact garment to put on her:" },
        { type: "image", mime_type: "image/jpeg", data: garment },
      ],
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "2:3", image_size: "1K", delivery: "inline" },
      generation_config: { seed: input.seed },
      store: false,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new TryOnProviderError(this.name, `interactions failed: ${res.status} ${t.slice(0, 300)}`, res.status >= 500 || res.status === 429, res.status);
      }
      const json = (await res.json()) as InteractionResponse;
      const b64 = extractImage(json);
      if (!b64) {
        const reason = json.errors?.map((e) => e.message).join("; ") || json.status || "no image in response";
        throw new TryOnProviderError(this.name, `no image returned (${reason})`, false);
      }
      const image = await sharp(Buffer.from(b64, "base64")).jpeg({ quality: 93 }).toBuffer();
      const meta = await sharp(image).metadata();
      return { image, contentType: "image/jpeg", width: meta.width ?? 0, height: meta.height ?? 0, seed: input.seed ?? null, provider: this.name, costUsd: 0.04 };
    } catch (err) {
      if (err instanceof TryOnProviderError) throw err;
      throw new TryOnProviderError(this.name, (err as Error).message, true);
    } finally {
      clearTimeout(timer);
    }
  }
}

type InteractionResponse = {
  status?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string }> }>;
  output_image?: { data?: string };
  errors?: Array<{ code?: string; message?: string }>;
};

function extractImage(json: InteractionResponse): string | null {
  if (json.output_image?.data) return json.output_image.data;
  for (const step of json.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content ?? []) if (block.type === "image" && block.data) return block.data;
  }
  return null;
}
