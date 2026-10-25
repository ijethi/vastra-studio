import type { GarmentAnalysis, ReelShotType, ReelVibe } from "@/lib/db/schema";
import type { Scene } from "@/lib/reels/scenes";

export type StoryboardInput = {
  /** JPEG/PNG bytes of the finished on-model image the scenes are drawn from. */
  heroImage: Buffer;
  /** Optional extra angles of the same garment (back, detail) that scenes can lean on. */
  references?: Array<{ kind: "back" | "detail" | "other"; image: Buffer }>;
  garmentAnalysis: GarmentAnalysis | null;
  garmentTitle: string;
  vibe: ReelVibe;
  /** The scene list for the vibe (from the content tables). Falls back to the built-in defaults when omitted. */
  scenes?: Scene[];
  /** How many scene stills to make; scenes beyond the vibe's list are not generated. */
  count: number;
  /** Per-still ceiling. */
  timeoutMs: number;
  /** Progress callback as each still lands. */
  onStill?: (done: number, total: number) => void | Promise<void>;
};

export type StoryboardStill = {
  /** JPEG bytes, portrait 9:16. */
  image: Buffer;
  width: number;
  height: number;
  sceneLabel: string;
  shotType: ReelShotType;
  /** The scene prompt that produced it (stored with the asset). */
  prompt: string;
  provider: string;
  seed: number | null;
  costUsd?: number;
};

export class StoryboardProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public retryable: boolean,
    public status?: number,
  ) {
    super(`[${provider}] ${message}`);
  }
}

export interface StoryboardProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  /** Scene stills in scene order. A failed scene is skipped, not thrown, unless every scene fails. */
  generate(input: StoryboardInput): Promise<StoryboardStill[]>;
}

export const STILL_WIDTH = 1080;
export const STILL_HEIGHT = 1920;
