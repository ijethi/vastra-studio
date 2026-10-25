/**
 * Sliding-window rate limiter with two backends:
 *
 *  - `MemorySlidingWindow`: per process, for development and tests.
 *  - `RedisSlidingWindow`: shared across every web and worker instance when
 *    REDIS_URL is set. One Lua script per decision keeps it atomic (no
 *    over-admission between instances). The script runner is an interface so
 *    the Redis path is unit-tested with an in-memory stand-in.
 *
 * No server-only import: the classes are plain and testable under Node.
 */

export type RateLimitDecision = {
  ok: boolean;
  /** Requests still allowed in the current window (0 when refused). */
  remaining: number;
  /** Seconds until the oldest hit leaves the window (0 when allowed). */
  retryAfterSec: number;
};

export interface RateLimiter {
  /** Record one hit for `key` and decide. `max` hits per `windowMs`. */
  hit(key: string, max: number, windowMs: number): Promise<RateLimitDecision>;
}

const retryAfter = (oldest: number, windowMs: number, now: number) => Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));

/* ------------------------------- memory ------------------------------- */

export class MemorySlidingWindow implements RateLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(private now: () => number = Date.now) {}

  async hit(key: string, max: number, windowMs: number): Promise<RateLimitDecision> {
    const now = this.now();
    const since = now - windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    this.sweep(now, windowMs);
    if (list.length >= max) {
      this.hits.set(key, list);
      return { ok: false, remaining: 0, retryAfterSec: retryAfter(list[0], windowMs, now) };
    }
    list.push(now);
    this.hits.set(key, list);
    return { ok: true, remaining: max - list.length, retryAfterSec: 0 };
  }

  /** Keep the map from growing without bound: drop keys with no hits inside the window. */
  private sweep(now: number, windowMs: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, v] of this.hits) if (v.every((t) => t <= now - windowMs)) this.hits.delete(k);
  }
}

/* -------------------------------- redis ------------------------------- */

/**
 * Atomic sliding window over a sorted set: trim entries older than the
 * window, count, add the new hit only when under the limit. Returns
 * [count after the call, oldest score still in the window, added (1|0)].
 */
export const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
local added = 0
if count < max then
  redis.call('ZADD', key, now, member)
  count = count + 1
  added = 1
end
redis.call('PEXPIRE', key, window)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local oldestScore = 0
if oldest[2] then oldestScore = tonumber(oldest[2]) end
return {count, oldestScore, added}
`;

/** The one Redis capability the limiter needs; an ioredis client satisfies it directly. */
export interface RedisScriptRunner {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

export class RedisSlidingWindow implements RateLimiter {
  private seq = 0;

  constructor(
    private redis: RedisScriptRunner,
    private opts: { prefix?: string; now?: () => number; onError?: (err: unknown) => void } = {},
  ) {}

  async hit(key: string, max: number, windowMs: number): Promise<RateLimitDecision> {
    const now = (this.opts.now ?? Date.now)();
    const member = `${now}-${process.pid}-${++this.seq}`;
    let result: unknown;
    try {
      result = await this.redis.eval(SLIDING_WINDOW_LUA, 1, `${this.opts.prefix ?? "rl"}:${key}`, now, windowMs, max, member);
    } catch (err) {
      // Fail open: a Redis blip must not take the product down. The caller logs it.
      this.opts.onError?.(err);
      return { ok: true, remaining: max, retryAfterSec: 0 };
    }
    const [count, oldest, added] = Array.isArray(result) ? result.map(Number) : [0, 0, 1];
    if (added !== 1) return { ok: false, remaining: 0, retryAfterSec: oldest ? retryAfter(oldest, windowMs, now) : Math.ceil(windowMs / 1000) };
    return { ok: true, remaining: Math.max(0, max - count), retryAfterSec: 0 };
  }
}

/**
 * In-memory stand-in for the Lua script, used by the unit tests and usable
 * as a fake Redis in development tooling. Implements exactly the commands
 * the script issues, over the same sorted-set semantics.
 */
export class FakeRedisScriptRunner implements RedisScriptRunner {
  sets = new Map<string, Array<{ score: number; member: string }>>();
  calls = 0;
  failWith: Error | null = null;

  async eval(_script: string, _numKeys: number, ...args: (string | number)[]): Promise<unknown> {
    this.calls++;
    if (this.failWith) throw this.failWith;
    const [key, nowArg, windowArg, maxArg, member] = args as [string, number, number, number, string];
    const now = Number(nowArg), window = Number(windowArg), max = Number(maxArg);
    const set = (this.sets.get(key) ?? []).filter((e) => e.score > now - window);
    let added = 0;
    if (set.length < max) {
      set.push({ score: now, member });
      added = 1;
    }
    set.sort((a, b) => a.score - b.score);
    this.sets.set(key, set);
    return [set.length, set[0]?.score ?? 0, added];
  }
}
