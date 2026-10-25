import { NextResponse } from "next/server";
import { connection } from "next/server";
import { pingDb } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { getQueue } from "@/lib/queue";
import { env } from "@/env";
import { log } from "@/lib/log";

type Check = { ok: boolean; ms: number; error?: string };

const startedAt = Date.now();

async function probe(name: string, fn: () => Promise<void>, timeoutMs = 4000): Promise<Check> {
  const t0 = Date.now();
  try {
    await Promise.race([fn(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs} ms`)), timeoutMs))]);
    return { ok: true, ms: Date.now() - t0 };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn("health check failed", { check: name, error });
    return { ok: false, ms: Date.now() - t0, error };
  }
}

/**
 * Liveness and readiness in one: 200 when the database, object storage and
 * the queue broker answer, 503 otherwise, with per-check timings. Load
 * balancers and uptime monitors poll it; it never caches and runs at
 * request time only (`connection()` keeps it out of the build prerender).
 */
export async function GET() {
  await connection();
  const [db, storage, queue] = await Promise.all([
    probe("db", () => pingDb()),
    probe("storage", () => getStorage().ping()),
    probe("queue", () => getQueue().ping()),
  ]);
  const ok = db.ok && storage.ok && queue.ok;
  return NextResponse.json(
    {
      ok,
      checks: { db, storage, queue },
      mode: { database: env.DATABASE_URL ? "postgres" : "pglite", storage: env.STORAGE_DRIVER, queue: env.REDIS_URL ? "bullmq" : "in-process" },
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.GIT_SHA?.slice(0, 7) ?? null,
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
