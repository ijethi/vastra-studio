import "server-only";
import { env } from "@/env";
import { InProcessQueue } from "./in-process";
import type { JobQueue } from "./types";

declare global {
   
  var __vastraQueue: JobQueue | undefined;
}

export function getQueue(): JobQueue {
  if (!globalThis.__vastraQueue) {
    if (env.REDIS_URL) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BullQueue } = require("./bullmq") as typeof import("./bullmq");
      globalThis.__vastraQueue = new BullQueue(env.REDIS_URL);
    } else {
      globalThis.__vastraQueue = new InProcessQueue();
    }
  }
  return globalThis.__vastraQueue;
}

export type { JobPayload, JobQueue } from "./types";
