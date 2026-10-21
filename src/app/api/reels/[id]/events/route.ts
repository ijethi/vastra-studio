import type { NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getReel } from "@/lib/dal/reels";
import { getStorage, READ_URL_TTL_SECONDS } from "@/lib/storage";
import type { ReelShotType, ReelStatus, ReelVibe } from "@/lib/db/schema";

export type ReelStillEvent = { id: string; url: string; thumbUrl: string; sceneLabel: string; shotType: ReelShotType; orderIndex: number; width: number; height: number };

export type ReelEvent = {
  id: string;
  status: ReelStatus;
  progress: number;
  statusMessage: string | null;
  vibe: ReelVibe;
  caption: string | null;
  garment: { id: string; title: string };
  stills: ReelStillEvent[];
  selectedStillIds: string[];
  clips: Array<{ id: string; sceneLabel: string; provider: string }>;
  output: { url: string; coverUrl: string | null; durationSec: number | null } | null;
  creditsCharged: number;
  creditsRefunded: number;
  /** True once the worker has nothing more to do for now ("selecting" counts: it waits on the owner). */
  done: boolean;
  error: string | null;
};

const DONE: ReelStatus[] = ["selecting", "completed", "partially_completed", "failed"];

/** Server-sent events for one reel; mirrors the job events route. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSessionContext();
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const tenantId = ctx.activeTenantId;
  if (!tenantId) return new Response("No boutique selected", { status: 400 });

  const first = await getReel(tenantId, id);
  if (!first) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  const storage = getStorage();

  const snapshot = async (): Promise<ReelEvent | null> => {
    const reel = await getReel(tenantId, id);
    if (!reel) return null;
    const stills = await Promise.all(
      reel.assets
        .filter((a) => a.kind === "still")
        .map(async (a) => ({
          id: a.id,
          url: await storage.signRead(a.storageKey, READ_URL_TTL_SECONDS),
          thumbUrl: await storage.signRead(a.thumbKey ?? a.storageKey, READ_URL_TTL_SECONDS),
          sceneLabel: a.sceneLabel,
          shotType: a.shotType,
          orderIndex: a.orderIndex,
          width: a.width,
          height: a.height,
        })),
    );
    const clips = reel.assets.filter((a) => a.kind === "clip").map((a) => ({ id: a.id, sceneLabel: a.sceneLabel, provider: a.provider }));
    const output = reel.outputKey
      ? {
          url: await storage.signRead(reel.outputKey, READ_URL_TTL_SECONDS),
          coverUrl: reel.coverKey ? await storage.signRead(reel.coverKey, READ_URL_TTL_SECONDS) : null,
          durationSec: reel.durationSec,
        }
      : null;
    return {
      id: reel.id,
      status: reel.status,
      progress: reel.progress,
      statusMessage: reel.statusMessage,
      vibe: reel.vibe,
      caption: reel.caption,
      garment: { id: reel.garment.id, title: reel.garment.title },
      stills,
      selectedStillIds: reel.selectedStillIds ?? [],
      clips,
      output,
      creditsCharged: reel.creditsCharged,
      creditsRefunded: reel.creditsRefunded,
      done: DONE.includes(reel.status),
      error: reel.error,
    };
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
      while (!closed && Date.now() - started < 30 * 60 * 1000) {
        const snap = await snapshot();
        if (!snap) break;
        const key = `${snap.status}:${snap.progress}:${snap.stills.length}:${snap.clips.length}:${snap.statusMessage}:${snap.output ? 1 : 0}`;
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
