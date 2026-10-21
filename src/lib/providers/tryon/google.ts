import sharp from "sharp";
import { createSign } from "node:crypto";
import { env } from "@/env";
import { TryOnProviderError, type TryOnInput, type TryOnOutput, type TryOnProvider } from "./types";

/**
 * Google Virtual Try-On 001 on Vertex AI / Gemini Enterprise Agent Platform.
 * Fallback provider. GA since 20 Jan 2026 with a discontinuation date of
 * 20 Jan 2027, so the adapter is deliberately thin.
 * Docs: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/virtual-try-on-preview-08-04
 */
export class GoogleTryOnProvider implements TryOnProvider {
  readonly name = "google";
  private tokenCache: { token: string; exp: number } | null = null;

  async isAvailable(): Promise<boolean> {
    return Boolean(env.GOOGLE_CLOUD_PROJECT && env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  }

  /** Service-account JWT -> OAuth access token, no extra dependency. */
  private async accessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.exp > Date.now() + 60_000) return this.tokenCache.token;
    if (!env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      throw new TryOnProviderError(this.name, "GOOGLE_APPLICATION_CREDENTIALS_JSON not set", false);
    }
    const sa = JSON.parse(env.GOOGLE_APPLICATION_CREDENTIALS_JSON) as { client_email: string; private_key: string };
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    });
    if (!res.ok) throw new TryOnProviderError(this.name, `token exchange failed: ${res.status}`, true, res.status);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  async generate(input: TryOnInput): Promise<TryOnOutput> {
    const token = await this.accessToken();
    const location = env.GOOGLE_CLOUD_LOCATION;
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${env.GOOGLE_CLOUD_PROJECT}/locations/${location}/publishers/google/models/virtual-try-on-001:predict`;

    const toB64 = async (buf: Buffer) => (await sharp(buf).rotate().jpeg({ quality: 95 }).toBuffer()).toString("base64");

    const body = {
      instances: [
        {
          personImage: { image: { bytesBase64Encoded: await toB64(input.modelImage) } },
          productImages: [{ image: { bytesBase64Encoded: await toB64(input.garmentImage) } }],
        },
      ],
      parameters: {
        sampleCount: 1,
        seed: input.seed,
        addWatermark: true,
        safetySetting: "block_medium_and_above",
        personGeneration: "allow_adult",
        outputOptions: { mimeType: "image/jpeg", compressionQuality: 92 },
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new TryOnProviderError(this.name, `predict failed: ${res.status} ${await res.text()}`, res.status >= 500 || res.status === 429, res.status);
      }
      const json = (await res.json()) as { predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }> };
      const pred = json.predictions?.[0];
      if (!pred?.bytesBase64Encoded) throw new TryOnProviderError(this.name, "no image returned (possibly filtered)", false);
      const image = Buffer.from(pred.bytesBase64Encoded, "base64");
      const meta = await sharp(image).metadata();
      return {
        image,
        contentType: "image/jpeg",
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        seed: input.seed ?? null,
        provider: this.name,
        costUsd: 0.06,
      };
    } catch (err) {
      if (err instanceof TryOnProviderError) throw err;
      throw new TryOnProviderError(this.name, (err as Error).message, true);
    } finally {
      clearTimeout(timer);
    }
  }
}
