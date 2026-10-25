import type { NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getJob, getJobStatus } from "@/lib/dal/jobs";
import { getStorage, READ_URL_TTL_SECONDS } from "@/lib/storage";

export type JobEvent = {
  id: string;
  status: string;
  progress: number;
  statusMessage: string | null;
  images: Array<{ id: string; url: string; thumbUrl: string; width: number; height: number; qualityScore: number | null; accepted: boolean }>;
  creditsRefunded: number;
  done: boolean;
};

const DONE = new Set(["completed", "partially_completed", "failed", "refunded"]);
const TICK_MS = 1000;
const MAX_MS = 10 * 60 * 1000;

/**
 * Server-sent events for one job. Each tick reads one small indexed row
 * (status, progress, image count); only when that changes is the full
 * snapshot loaded and every image URL signed in a single batch. The worker
 * may be in another process, so the database is the source of truth.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const tenantId = ctx.activeTenantId;
  if (!tenantId) return new Response("No boutique selected", { status: 400 });

  const first = await getJobStatus(tenantId, id);
  if (!first) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  const storage = getStorage();

  const snapshot = async (): Promise<JobEvent | null> => {
    const job = await getJob(tenantId, id);
    if (!job) return null;
    const urls = await storage.signReadMany(job.images.flatMap((img) => [img.storageKey, img.thumbKey]), READ_URL_TTL_SECONDS);
    const images = job.images.map((img) => ({
      id: img.id,
      url: urls.get(img.storageKey)!,
      thumbUrl: urls.get(img.thumbKey)!,
      width: img.width,
      height: img.height,
      qualityScore: img.qualityScore,
      accepted: img.accepted,
    }));
    return { id: job.id, status: job.status, progress: job.progress, statusMessage: job.statusMessage, images, creditsRefunded: job.creditsRefunded, done: DONE.has(job.status) };
  };

  const stream = new ReadableStream({
    async start(controller) {
      let last = "";
      let closed = false;
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      req.signal.addEventListener("abort", () => {
        closed = true;
      });
      const started = Date.now();
      while (!closed && Date.now() - started < MAX_MS) {
        const light = await getJobStatus(tenantId, id);
        if (!light) break;
        const key = `${light.status}:${light.progress}:${light.imageCount}:${light.statusMessage}:${light.creditsRefunded}`;
        if (key !== last) {
          const snap = await snapshot();
          if (!snap) break;
          send(snap);
          last = key;
          if (snap.done) break;
        } else if (DONE.has(light.status)) {
          break;
        }
        await new Promise((r) => setTimeout(r, TICK_MS));
      }
      if (!closed) controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
