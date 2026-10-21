import "server-only";
import { videoProviderOrder, type VideoProviderName } from "@/env";
import { getPlatformSetting } from "@/lib/dal/platform";
import { MockVideoProvider } from "./mock";
import { KlingVideoProvider } from "./kling";
import { GeminiVideoProvider } from "./gemini";
import { VideoProviderError, type VideoInput, type VideoOutput, type VideoProvider } from "./types";

const registry: Record<VideoProviderName, () => VideoProvider> = {
  mock: () => new MockVideoProvider(),
  kling: () => new KlingVideoProvider(),
  gemini: () => new GeminiVideoProvider(),
};

const instances = new Map<VideoProviderName, VideoProvider>();

function instance(name: VideoProviderName): VideoProvider {
  let p = instances.get(name);
  if (!p) {
    p = registry[name]();
    instances.set(name, p);
  }
  return p;
}

export type VideoSwitches = Partial<Record<VideoProviderName, { enabled: boolean }>>;

/** Providers in VIDEO_PROVIDERS order, honouring the admin kill switches and dropping anything not configured. */
export async function availableVideoProviders(): Promise<VideoProvider[]> {
  const switches = (await getPlatformSetting<VideoSwitches>("video.switches")) ?? {};
  const out: VideoProvider[] = [];
  for (const name of videoProviderOrder) {
    if (switches[name]?.enabled === false) continue;
    const p = instance(name);
    if (await p.isAvailable()) out.push(p);
  }
  return out;
}

/** Animate with the first healthy provider, failing over on retryable errors. Non-retryable errors stop. */
export async function animateWithFailover(input: VideoInput): Promise<VideoOutput> {
  const providers = await availableVideoProviders();
  if (providers.length === 0) throw new VideoProviderError("none", "No video provider is configured or enabled", false);
  let lastError: unknown;
  for (const p of providers) {
    try {
      return await p.animate(input);
    } catch (err) {
      lastError = err;
      if (err instanceof VideoProviderError && !err.retryable) throw err;
      console.warn(`[video] ${p.name} failed, trying next provider:`, (err as Error).message);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All video providers failed");
}

export { VideoProviderError };
export { NEGATIVE_PROMPT, motionPrompt } from "./prompts";
export type { VideoInput, VideoOutput, VideoProvider };
