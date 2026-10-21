import "server-only";
import { env } from "@/env";
import { MockVisionProvider } from "./mock";
import type { VisionProvider } from "./types";

let instance: VisionProvider | undefined;

export function getVision(): VisionProvider {
  if (!instance) {
    if (env.VISION_PROVIDER === "claude" && env.ANTHROPIC_API_KEY) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ClaudeVisionProvider } = require("./claude") as typeof import("./claude");
      instance = new ClaudeVisionProvider();
    } else {
      instance = new MockVisionProvider();
    }
  }
  return instance;
}

export { GATE_THRESHOLD } from "./types";
export type { VisionProvider };
