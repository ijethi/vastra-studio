import "server-only";
import { env } from "@/env";
import { GeminiStoryboardProvider } from "./gemini";
import { MockStoryboardProvider } from "./mock";
import type { StoryboardProvider } from "./types";

let instance: StoryboardProvider | undefined;

/**
 * Scene-still generator for reels. `STORYBOARD_PROVIDER=gemini` with a
 * `GEMINI_API_KEY` uses the Gemini image model; anything else, or a missing
 * key, re-frames the hero image offline.
 */
export function getStoryboard(): StoryboardProvider {
  if (!instance) {
    if (env.STORYBOARD_PROVIDER === "gemini" && env.GEMINI_API_KEY) instance = new GeminiStoryboardProvider();
    else instance = new MockStoryboardProvider();
  }
  return instance;
}

export { StoryboardProviderError, STILL_WIDTH, STILL_HEIGHT } from "./types";
export type { StoryboardProvider, StoryboardInput, StoryboardStill } from "./types";
