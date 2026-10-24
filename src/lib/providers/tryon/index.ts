import "server-only";
import { tryOnProviderOrder, type TryOnProviderName } from "@/env";
import { MockTryOnProvider } from "./mock";
import { GeminiTryOnProvider } from "./gemini";
import { GoogleTryOnProvider } from "./google";
import { TryOnProviderError, type TryOnInput, type TryOnOutput, type TryOnProvider } from "./types";
import { getPlatformSetting } from "@/lib/dal/platform";

const registry: Record<TryOnProviderName, () => TryOnProvider> = {
  mock: () => new MockTryOnProvider(),
  gemini: () => new GeminiTryOnProvider(),
  google: () => new GoogleTryOnProvider(),
};

const instances = new Map<TryOnProviderName, TryOnProvider>();

function instance(name: TryOnProviderName): TryOnProvider {
  let p = instances.get(name);
  if (!p) {
    p = registry[name]();
    instances.set(name, p);
  }
  return p;
}

export type ProviderSwitches = Partial<Record<TryOnProviderName, { enabled: boolean }>>;

/**
 * Providers in priority order, honouring the admin kill switches and
 * dropping anything not configured. Falls back to the mock in development
 * only when nothing else is available.
 */
export async function availableProviders(): Promise<TryOnProvider[]> {
  const switches = (await getPlatformSetting<ProviderSwitches>("tryon.switches")) ?? {};
  const out: TryOnProvider[] = [];
  for (const name of tryOnProviderOrder) {
    if (switches[name]?.enabled === false) continue;
    const p = instance(name);
    if (await p.isAvailable()) out.push(p);
  }
  return out;
}

/**
 * Run the try-on against the first healthy provider, failing over on
 * retryable errors. Non-retryable errors (bad input, moderation) stop.
 */
export async function generateWithFailover(input: TryOnInput): Promise<TryOnOutput> {
  const providers = await availableProviders();
  if (providers.length === 0) throw new TryOnProviderError("none", "No try-on provider is configured or enabled", false);
  let lastError: unknown;
  for (const p of providers) {
    try {
      return await p.generate(input);
    } catch (err) {
      lastError = err;
      if (err instanceof TryOnProviderError && !err.retryable) throw err;
      console.warn(`[tryon] ${p.name} failed, trying next provider:`, (err as Error).message);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All try-on providers failed");
}

export { TryOnProviderError };
export type { TryOnInput, TryOnOutput, TryOnProvider };
