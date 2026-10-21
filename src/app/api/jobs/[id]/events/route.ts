import type { NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getJob } from "@/lib/dal/jobs";
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

/**
 * Server-sent events for one job. Polls the database (the worker may be in
 * another process) and pushes a snapshot whenever something changes.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const tenantId = ctx.activeTenantId;
  if (!tenantId) return new Response("No boutique selected", { status: 400 });

  const first = await getJob(tenantId, id);
  if (!first) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  const storage = getStorage();

  const snapshot = async (): Promise<JobEvent | null> => {
    const job = await getJob(tenantId, id);
    if (!job) return null;
    const images = await Promise.all(
      job.images.map(async (img) => ({
        id: img.id,
        url: await storage.signRead(img.storageKey, READ_URL_TTL_SECONDS),
        thumbUrl: await storage.signRead(img.thumbKey, READ_URL_TTL_SECONDS),
        width: img.width,
        height: img.height,
        qualityScore: img.qualityScore,
        accepted: img.accepted,
      })),
    );
    const done = ["completed", "partially_completed", "failed", "refunded"].includes(job.status);
    return { id: job.id, status: job.status, progress: job.progress, statusMessage: job.statusMessage, images, creditsRefunded: job.creditsRefunded, done };
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
      while (!closed && Date.now() - started < 10 * 60 * 1000) {
        const snap = await snapshot();
        if (!snap) break;
        const key = `${snap.status}:${snap.progress}:${snap.images.length}:${snap.statusMessage}`;
        if (key !== last) {
          send(snap);
          last = key;
        }
        if (snap.done) break;
        await new Promise((r) => setTimeout(r, 1000));
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
