import { env } from "@/env";
import { REEL_HEIGHT, REEL_WIDTH, isMp4 } from "@/lib/reels/ffmpeg";
import { VideoProviderError, type VideoInput, type VideoOutput, type VideoProvider } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/**
 * Video generation through the Gemini API's Interactions endpoint, the same
 * call shape as the image generator in person/gemini.ts. The Veo 3.1 preview
 * models were retired on 22 October 2026; Gemini Omni Flash is the current
 * image-to-video model, so GEMINI_VIDEO_MODEL defaults to it.
 * Docs: https://ai.google.dev/gemini-api/docs/omni and /gemini-api/docs/video
 *
 * Request: input blocks (image + text), response_format { type: "video",
 * aspect_ratio, resolution, delivery }, generation_config.video_config.task.
 * The API has no negative-prompt field, so the negatives are written into the
 * prompt as "Do not ..." and the clip length is asked for in words.
 * Response: a model_output step whose content holds { type: "video", data }
 * (inline base64) or { uri } when delivered as a file.
 */
export class GeminiVideoProvider implements VideoProvider {
  readonly name = "gemini";

  async isAvailable(): Promise<boolean> {
    return Boolean(env.GEMINI_API_KEY);
  }

  async animate(input: VideoInput): Promise<VideoOutput> {
    if (!env.GEMINI_API_KEY) throw new VideoProviderError(this.name, "GEMINI_API_KEY not set", false);
    const seconds = Math.max(2, Math.min(10, Math.round(input.durationSec || 5)));
    const text = `${input.prompt} The clip is ${seconds} seconds long. Do not produce: ${input.negativePrompt}.`;
    const body = {
      model: env.GEMINI_VIDEO_MODEL,
      input: [
        { type: "image", mime_type: "image/jpeg", data: input.image.toString("base64") },
        { type: "text", text },
      ],
      response_format: { type: "video", aspect_ratio: input.aspect, resolution: "1080p", delivery: "inline" },
      generation_config: { video_config: { task: "image_to_video" } },
      background: false,
      stream: false,
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
        throw new VideoProviderError(this.name, `interactions failed: ${res.status} ${t.slice(0, 300)}`, res.status >= 500 || res.status === 429, res.status);
      }
      const json = (await res.json()) as InteractionResponse;
      const block = extractVideo(json);
      if (!block) {
        const reason = json.errors?.map((e) => e.message).join("; ") || json.status || "no video in response";
        throw new VideoProviderError(this.name, `no video returned (${reason})`, false);
      }
      let video: Buffer;
      if (block.data) {
        video = Buffer.from(block.data, "base64");
      } else {
        const dl = await fetch(block.uri!, { headers: { "x-goog-api-key": env.GEMINI_API_KEY }, signal: controller.signal });
        if (!dl.ok) throw new VideoProviderError(this.name, `video download failed: ${dl.status}`, true, dl.status);
        video = Buffer.from(await dl.arrayBuffer());
      }
      if (!isMp4(video)) throw new VideoProviderError(this.name, "returned file is not an MP4", false);
      return { video, contentType: "video/mp4", durationSec: seconds, width: REEL_WIDTH, height: REEL_HEIGHT, provider: this.name, providerRef: json.id, costUsd: 0.4 };
    } catch (err) {
      if (err instanceof VideoProviderError) throw err;
      throw new VideoProviderError(this.name, (err as Error).message, true);
    } finally {
      clearTimeout(timer);
    }
  }
}

type InteractionResponse = {
  id?: string;
  status?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string; uri?: string; mime_type?: string }> }>;
  errors?: Array<{ code?: string; message?: string }>;
};

function extractVideo(json: InteractionResponse): { data?: string; uri?: string } | null {
  for (const step of json.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content ?? []) {
      if (block.type === "video" && (block.data || block.uri)) return { data: block.data, uri: block.uri };
    }
  }
  return null;
}
