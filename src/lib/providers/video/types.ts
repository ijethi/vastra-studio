import type { ReelShotType } from "@/lib/db/schema";

export type VideoInput = {
  /** JPEG/PNG bytes of the still to animate (portrait 9:16). */
  image: Buffer;
  /** Motion prompt: garment, camera move, action, light, style. */
  prompt: string;
  negativePrompt: string;
  durationSec: number;
  aspect: "9:16";
  /** Lets offline providers pick a matching camera move. */
  shotType?: ReelShotType;
  seed?: number;
  /** Hard ceiling for the whole call, polling included. */
  timeoutMs: number;
};

export type VideoOutput = {
  /** MP4 (H.264) bytes. */
  video: Buffer;
  contentType: "video/mp4";
  durationSec: number;
  width: number;
  height: number;
  provider: string;
  providerRef?: string;
  costUsd?: number;
};

export class VideoProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public retryable: boolean,
    public status?: number,
  ) {
    super(`[${provider}] ${message}`);
  }
}

export interface VideoProvider {
  readonly name: string;
  /** Resolve true when configured and healthy enough to accept traffic. */
  isAvailable(): Promise<boolean>;
  animate(input: VideoInput): Promise<VideoOutput>;
}
