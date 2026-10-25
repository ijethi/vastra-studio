import "server-only";
import { headers } from "next/headers";
import { env } from "@/env";
import { log } from "@/lib/log";
import { MemorySlidingWindow, RedisSlidingWindow, type RateLimitDecision, type RateLimiter } from "./rate-limit";

/** Best-effort client IP for audit logs and rate limiting. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip");
}

/** The request id the proxy attached (or the platform's), for log correlation. */
export async function requestId(): Promise<string | null> {
  const h = await headers();
  return h.get("x-request-id");
}

declare global {

  var __vastraRateLimiter: RateLimiter | undefined;
}

/**
 * One limiter per process: Redis-backed (shared across instances) when
 * REDIS_URL is set, otherwise the in-memory window for development.
 */
export function getRateLimiter(): RateLimiter {
  if (!globalThis.__vastraRateLimiter) {
    if (env.REDIS_URL) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const IORedis = require("ioredis") as typeof import("ioredis");
      const client = new IORedis.default(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true });
      client.on("error", (err: Error) => log.warn("rate-limit redis error", { error: err.message }));
      void client.connect().catch(() => {});
      globalThis.__vastraRateLimiter = new RedisSlidingWindow(client, { onError: (err) => log.warn("rate-limit redis unavailable, failing open", { error: (err as Error).message }) });
    } else {
      globalThis.__vastraRateLimiter = new MemorySlidingWindow();
    }
  }
  return globalThis.__vastraRateLimiter;
}

/** Sliding-window check: `max` hits per `windowMs` for `key`. */
export function rateLimit(key: string, max: number, windowMs: number): Promise<RateLimitDecision> {
  return getRateLimiter().hit(key, max, windowMs);
}

const HOUR = 60 * 60 * 1000;

/**
 * Per-tenant and per-user ceilings on the write paths. The tenant ceiling
 * protects providers and the bill; the user ceiling stops one runaway device
 * (or one stolen session) from consuming a boutique's whole allowance.
 */
export const LIMITS = {
  upload: { tenant: { max: 240, windowMs: HOUR }, user: { max: 120, windowMs: HOUR } },
  job: { tenant: { max: env.TENANT_JOBS_PER_HOUR, windowMs: HOUR }, user: { max: Math.max(10, Math.ceil(env.TENANT_JOBS_PER_HOUR / 2)), windowMs: HOUR } },
  reel: { tenant: { max: Math.max(5, Math.floor(env.TENANT_JOBS_PER_HOUR / 4)), windowMs: HOUR }, user: { max: Math.max(5, Math.floor(env.TENANT_JOBS_PER_HOUR / 6)), windowMs: HOUR } },
  share: { tenant: { max: 200, windowMs: HOUR }, user: { max: 100, windowMs: HOUR } },
} as const;

export type LimitKind = keyof typeof LIMITS;

/**
 * Apply both ceilings for one action. The user check runs first so a refused
 * user does not consume the tenant's allowance.
 */
export async function enforceLimit(kind: LimitKind, who: { tenantId: string; userId: string }): Promise<RateLimitDecision> {
  const spec = LIMITS[kind];
  const user = await rateLimit(`${kind}:user:${who.userId}`, spec.user.max, spec.user.windowMs);
  if (!user.ok) return user;
  const tenant = await rateLimit(`${kind}:tenant:${who.tenantId}`, spec.tenant.max, spec.tenant.windowMs);
  return tenant;
}

export function limitMessage(kind: LimitKind, decision: RateLimitDecision): string {
  const what = kind === "upload" ? "uploads" : kind === "job" ? "generation runs" : kind === "reel" ? "reels" : "share links";
  const wait = decision.retryAfterSec >= 120 ? `${Math.ceil(decision.retryAfterSec / 60)} minutes` : `${decision.retryAfterSec} seconds`;
  return `You have reached the hourly limit for ${what}. Please try again in ${wait}.`;
}
