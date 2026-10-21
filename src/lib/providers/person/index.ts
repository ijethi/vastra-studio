import "server-only";
import { env } from "@/env";
import { GeminiPersonGenerator } from "./gemini";
import { MockPersonGenerator } from "./mock";
import type { PersonGenerator } from "./types";

let instance: PersonGenerator | undefined;

/**
 * Exact-garment generator for mannequin photos. `PERSON_PROVIDER=gemini` with
 * a `GEMINI_API_KEY` uses Gemini image generation; anything else, or a missing
 * key, uses the offline compositor.
 */
export function getPersonGenerator(): PersonGenerator {
  if (!instance) {
    if (env.PERSON_PROVIDER === "gemini" && env.GEMINI_API_KEY) instance = new GeminiPersonGenerator();
    else instance = new MockPersonGenerator();
  }
  return instance;
}

export { PersonProviderError, PERSON_CANVAS } from "./types";
export { placeGarment, pasteGarmentExact, softShadow } from "./compose";
export type { PersonGenerator, PersonGenInput, PersonGenOutput, PersonHints } from "./types";
