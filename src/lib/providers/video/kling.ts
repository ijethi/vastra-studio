import { env } from "@/env";
import { REEL_HEIGHT, REEL_WIDTH, isMp4 } from "@/lib/reels/ffmpeg";
import { VideoProviderError, type VideoInput, type VideoOutput, type VideoProvider } from "./types";

const QUEUE = "https://queue.fal.run";
const POLL_MS = 3000;

/**
 * Kling image-to-video through fal.ai's queue API.
 *   POST   https://queue.fal.run/{model}            Authorization: Key $FAL_KEY   -> { request_id, status_url, response_url }
 *   GET    {status_url}                             -> { status: IN_QUEUE | IN_PROGRESS | COMPLETED, error? }
 *   GET    {response_url}                           -> { video: { url } }
 * Docs: https://fal.ai/docs/model-apis/model-endpoints/queue and the model page
 * https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/api
 * Input fields: start_image_url (a base64 data URI is accepted), prompt, duration ("3".."15"),
 * negative_prompt, cfg_scale, generate_audio. The clip follows the start image's aspect ratio,
 * so a 9:16 still gives a 9:16 clip.
 */
export class KlingVideoProvider implements VideoProvider {
  readonly name = "kling";

  async isAvailable(): Promise<boolean> {
    return Boolean(env.FAL_KEY);
  }

  async animate(input: VideoInput): Promise<VideoOutput> {
    if (!env.FAL_KEY) throw new VideoProviderError(this.name, "FAL_KEY not set", false);
    const headers = { Authorization: `Key ${env.FAL_KEY}`, "Content-Type": "application/json" };
    const deadline = Date.now() + input.timeoutMs;
    const seconds = Math.max(3, Math.min(15, Math.round(input.durationSec || 5)));

    const body = {
      prompt: input.prompt,
      start_image_url: `data:image/jpeg;base64,${input.image.toString("base64")}`,
      duration: String(seconds),
      negative_prompt: input.negativePrompt,
      cfg_scale: 0.5,
      generate_audio: false,
      enable_safety_checker: true,
    };

    const submit = await this.fetchJson<{ request_id: string; status_url: string; response_url: string }>(`${QUEUE}/${env.FAL_KLING_MODEL}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
    });

    let status = "";
    while (Date.now() < deadline) {
      const s = await this.fetchJson<{ status: string; error?: string; error_type?: string }>(submit.status_url, { headers, signal: AbortSignal.timeout(30_000) });
      status = s.status;
      if (s.error) throw new VideoProviderError(this.name, `request failed: ${s.error_type ?? ""} ${s.error}`.trim(), false);
      if (status === "COMPLETED") break;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    if (status !== "COMPLETED") throw new VideoProviderError(this.name, `timed out after ${input.timeoutMs} ms (last status ${status || "none"})`, true);

    const result = await this.fetchJson<{ video?: { url?: string; content_type?: string } }>(submit.response_url, { headers, signal: AbortSignal.timeout(30_000) });
    const url = result.video?.url;
    if (!url) throw new VideoProviderError(this.name, "no video in response", false);
    const res = await fetch(url, { signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())) });
    if (!res.ok) throw new VideoProviderError(this.name, `video download failed: ${res.status}`, true, res.status);
    const video = Buffer.from(await res.arrayBuffer());
    if (!isMp4(video)) throw new VideoProviderError(this.name, "downloaded file is not an MP4", false);

    return {
      video,
      contentType: "video/mp4",
      durationSec: seconds,
      width: REEL_WIDTH,
      height: REEL_HEIGHT,
      provider: this.name,
      providerRef: submit.request_id,
      // Kling 3 standard list price per 5 s clip at the time of writing; informational only.
      costUsd: 0.35,
    };
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new VideoProviderError(this.name, (err as Error).message, true);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new VideoProviderError(this.name, `${res.status} ${text.slice(0, 300)}`, res.status >= 500 || res.status === 429, res.status);
    }
    return (await res.json()) as T;
  }
}
