import sharp from "sharp";
import { env } from "@/env";
import { TryOnProviderError, type TryOnInput, type TryOnOutput, type TryOnProvider } from "./types";

const API = "https://api.fashn.ai/v1";

type RunResponse = { id: string; error?: { name: string; message: string } | string | null };
type StatusResponse = {
  id: string;
  status: "starting" | "in_queue" | "processing" | "completed" | "failed";
  output?: string[];
  error?: { name: string; message: string } | string | null;
};

/**
 * FASHN virtual try-on (v1.6). Primary provider: keeps prints and text sharp,
 * accepts flat-lay or on-model garment photos, 864x1296 output.
 * Docs: https://docs.fashn.ai
 */
export class FashnTryOnProvider implements TryOnProvider {
  readonly name = "fashn";

  async isAvailable(): Promise<boolean> {
    return Boolean(env.FASHN_API_KEY);
  }

  private headers() {
    return { Authorization: `Bearer ${env.FASHN_API_KEY}`, "Content-Type": "application/json" };
  }

  async generate(input: TryOnInput): Promise<TryOnOutput> {
    if (!env.FASHN_API_KEY) throw new TryOnProviderError(this.name, "FASHN_API_KEY not set", false);

    const toDataUri = async (buf: Buffer) =>
      `data:image/jpeg;base64,${(await sharp(buf).rotate().jpeg({ quality: 95 }).toBuffer()).toString("base64")}`;

    const category =
      input.category === "top" ? "tops" : input.category === "bottom" ? "bottoms" : input.category === "unknown" ? "auto" : "one-pieces";

    const body = {
      model_name: "tryon-v1.6",
      inputs: {
        model_image: await toDataUri(input.modelImage),
        garment_image: await toDataUri(input.garmentImage),
        category,
        garment_photo_type: input.garmentPhotoType === "on-model" ? "model" : input.garmentPhotoType,
        mode: input.quality === "quality" ? "quality" : "balanced",
        seed: input.seed,
        num_samples: 1,
        output_format: "jpeg",
        moderation_level: "conservative",
      },
    };

    const started = Date.now();
    const run = await fetch(`${API}/run`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    if (!run.ok) {
      throw new TryOnProviderError(this.name, `run failed: ${run.status} ${await run.text()}`, run.status >= 500 || run.status === 429, run.status);
    }
    const { id, error } = (await run.json()) as RunResponse;
    if (error) throw new TryOnProviderError(this.name, typeof error === "string" ? error : error.message, false);

    // Poll until complete or timeout.
    while (Date.now() - started < input.timeoutMs) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(`${API}/status/${id}`, { headers: this.headers() });
      if (!res.ok) throw new TryOnProviderError(this.name, `status failed: ${res.status}`, res.status >= 500, res.status);
      const status = (await res.json()) as StatusResponse;
      if (status.status === "completed" && status.output?.[0]) {
        const img = await fetch(status.output[0]);
        if (!img.ok) throw new TryOnProviderError(this.name, "output download failed", true);
        const image = Buffer.from(await img.arrayBuffer());
        const meta = await sharp(image).metadata();
        return {
          image,
          contentType: "image/jpeg",
          width: meta.width ?? 864,
          height: meta.height ?? 1296,
          seed: input.seed ?? null,
          provider: this.name,
          providerRef: id,
          costUsd: 0.075,
        };
      }
      if (status.status === "failed") {
        const msg = typeof status.error === "string" ? status.error : status.error?.message ?? "generation failed";
        throw new TryOnProviderError(this.name, msg, false);
      }
    }
    throw new TryOnProviderError(this.name, "timed out waiting for result", true);
  }
}
