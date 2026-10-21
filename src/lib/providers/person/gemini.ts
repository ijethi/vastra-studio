import sharp from "sharp";
import { env } from "@/env";
import { getBackdrop, SKIN_TONES } from "@/lib/base-models/catalog";
import { pasteGarmentExact, placeGarment } from "./compose";
import { PERSON_CANVAS, PersonProviderError, type PersonGenInput, type PersonGenOutput, type PersonGenerator } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/**
 * Gemini image generation through the Interactions API
 * (POST /v1beta/interactions, header x-goog-api-key, input blocks of type
 * text/image, response_format of type image; the image comes back base64 in a
 * model_output step). Docs: https://ai.google.dev/gemini-api/docs/image-generation
 *
 * The garment is placed on a 2:3 canvas at a known position before the call
 * and the model is asked to draw the woman and backdrop around it without
 * moving it. Afterwards the original garment pixels are pasted back through
 * the feathered mask, so whatever the model did to the garment is undone;
 * the exact-match check then confirms the result still lines up.
 */
export class GeminiPersonGenerator implements PersonGenerator {
  readonly name = "gemini";

  async isAvailable(): Promise<boolean> {
    return Boolean(env.GEMINI_API_KEY);
  }

  async generate(input: PersonGenInput): Promise<PersonGenOutput> {
    if (!env.GEMINI_API_KEY) throw new PersonProviderError(this.name, "GEMINI_API_KEY not set", false);
    const placed = await placeGarment(input.garmentCutout, input.garmentMask, input.category);

    // Reference canvas: the garment on a flat mid-grey card so the model sees the exact silhouette and position.
    const canvas = await sharp({ create: { width: PERSON_CANVAS.width, height: PERSON_CANVAS.height, channels: 3, background: "#8A8A8A" } })
      .composite([{ input: placed.layer, left: 0, top: 0 }])
      .jpeg({ quality: 95 })
      .toBuffer();
    const maskImage = await sharp(placed.canvasMask).png().toBuffer();

    const body = {
      model: env.GEMINI_IMAGE_MODEL,
      input: [
        { type: "text", text: prompt(input) },
        { type: "text", text: "Image 1, the garment already placed on the canvas. Keep it exactly here, at this size, with these colours and details:" },
        { type: "image", mime_type: "image/jpeg", data: canvas.toString("base64") },
        { type: "text", text: "Image 2, the mask: white is the garment and must not change; black is where you draw the woman and the backdrop:" },
        { type: "image", mime_type: "image/png", data: maskImage.toString("base64") },
      ],
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "2:3", image_size: "1K", delivery: "inline" },
      generation_config: { seed: input.hints.seed },
      store: false,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    let generated: Buffer;
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new PersonProviderError(this.name, `interactions failed: ${res.status} ${text.slice(0, 300)}`, res.status >= 500 || res.status === 429, res.status);
      }
      const json = (await res.json()) as InteractionResponse;
      const b64 = extractImage(json);
      if (!b64) {
        const reason = json.errors?.map((e) => e.message).join("; ") || json.status || "no image in response";
        throw new PersonProviderError(this.name, `no image returned (${reason})`, false);
      }
      generated = Buffer.from(b64, "base64");
    } catch (err) {
      if (err instanceof PersonProviderError) throw err;
      throw new PersonProviderError(this.name, (err as Error).message, true);
    } finally {
      clearTimeout(timer);
    }

    const image = await pasteGarmentExact(generated, placed);
    return {
      image,
      width: PERSON_CANVAS.width,
      height: PERSON_CANVAS.height,
      placement: placed.placement,
      canvasMask: placed.canvasMask,
      garmentLayer: placed.layer,
      seed: input.hints.seed,
      provider: this.name,
      costUsd: 0.04,
    };
  }
}

type InteractionResponse = {
  id?: string;
  status?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string; mime_type?: string; text?: string }> }>;
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

function prompt(input: PersonGenInput): string {
  const { hints } = input;
  const backdrop = getBackdrop(hints.backdrop);
  const skin = SKIN_TONES[hints.skinTone]?.label.toLowerCase() ?? hints.skinTone;
  const body = { slim: "slim", regular: "average", curvy: "curvy", plus: "plus-size" }[hints.bodyType];
  const age = { "20s": "in her twenties", "30s": "in her thirties", "40s": "in her forties" }[hints.ageRange];
  const scene = backdrop
    ? `${backdrop.label}: ${backdrop.description}`
    : "a soft ivory studio backdrop";
  return [
    "Photoreal fashion catalogue photo for an Indian boutique.",
    `Draw a realistic Indian woman ${age}, ${body} build, ${skin} skin tone, standing naturally and facing the camera, wearing exactly the garment shown in image 1.`,
    "The garment is already in its final position on the canvas. Do not move, resize, recolour, redraw or restyle it; do not change its embroidery, borders, sleeves or hem. Draw only her head, neck, arms, hands, legs and feet around and behind it, plus the scene.",
    `Backdrop: ${scene}. Soft, even daylight that matches the garment's existing lighting. Full-length framing, 2:3 portrait.`,
    "No text, no logos, no watermark, no other garments, no extra people. Natural hands and anatomy.",
  ].join(" ");
}
