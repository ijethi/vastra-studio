import "server-only";
import sharp from "sharp";
import { getStorage, keys } from "@/lib/storage";
import { getVision } from "@/lib/providers/vision";
import { getStoryboard, StoryboardProviderError } from "@/lib/providers/storyboard";
import { animateWithFailover, motionPrompt, NEGATIVE_PROMPT, VideoProviderError } from "@/lib/providers/video";
import { assembleReel, CLIP_SECONDS } from "@/lib/reels/assemble";
import { orderForArc } from "@/lib/reels/arc";
import { makeThumb } from "@/lib/images";
import { newId } from "@/lib/ids";
import { getReelForWorker, insertReelAsset, setReelProgress, updateReel } from "@/lib/dal/reels";
import { creditTenant } from "@/lib/dal/tenants";
import { creditsForClip, REEL_STILL_COUNT, refundPerFailedStill } from "@/lib/dal/pricing";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { ReelAsset } from "@/lib/db/schema";

const STILL_TIMEOUT_MS = 90_000;
const CLIP_TIMEOUT_MS = 6 * 60_000;

/* ----------------------------- stills ----------------------------- */

/**
 * Sketch the scene stills from the hero image, judge each against the
 * garment photo, keep the ones that pass and refund the ones that do not.
 * Ends in "selecting": the owner picks which stills become clips.
 */
export async function runReelStills(reelId: string): Promise<void> {
  const reel = await getReelForWorker(reelId);
  if (!reel || !["queued", "stills"].includes(reel.status)) return;
  const { tenantId } = reel;
  const storage = getStorage();
  const vision = getVision();
  await updateReel(reelId, { status: "stills", progress: 3, statusMessage: "Reading the look", startedAt: reel.startedAt ?? new Date() });

  let kept = 0;
  let failed = 0;
  try {
    const [heroImage, garmentImage] = await Promise.all([storage.get(reel.sourceImage.storageKey), storage.get(reel.garment.originalKey)]);
    const analysis = reel.garment.analysis ?? null;
    const stills = await getStoryboard().generate({
      heroImage,
      garmentAnalysis: analysis,
      garmentTitle: reel.garment.title,
      vibe: reel.vibe,
      count: REEL_STILL_COUNT,
      timeoutMs: STILL_TIMEOUT_MS,
      onStill: (done, total) => setReelProgress(reelId, "stills", Math.round(5 + (done / total) * 45), `Sketching scene ${done} of ${total}`),
    });
    failed += Math.max(0, REEL_STILL_COUNT - stills.length);

    for (let i = 0; i < stills.length; i++) {
      const still = stills[i];
      await setReelProgress(reelId, "stills", Math.round(50 + (i / stills.length) * 48), `Checking the garment in scene ${i + 1} of ${stills.length}`);
      // The same gate as the image pipeline: a still that changed the garment is never shown.
      const verdict = await vision.assessOutput({ garmentImage, outputImage: still.image, analysis });
      if (!verdict.pass) {
        failed++;
        console.log(`[reel] ${reelId} still "${still.sceneLabel}" failed the gate: ${verdict.reasons.join("; ")}`);
        continue;
      }
      const assetId = newId("rst");
      const storageKey = keys.reelStill(tenantId, reelId, assetId);
      const thumbKey = keys.reelStillThumb(tenantId, reelId, assetId);
      await storage.put(storageKey, still.image, "image/jpeg");
      await storage.put(thumbKey, await makeThumb(still.image, 640), "image/jpeg");
      await insertReelAsset({
        id: assetId,
        reelJobId: reelId,
        tenantId,
        kind: "still",
        storageKey,
        thumbKey,
        width: still.width,
        height: still.height,
        sceneLabel: still.sceneLabel,
        shotType: still.shotType,
        prompt: still.prompt,
        provider: still.provider,
        gateVerdict: verdict,
        orderIndex: i,
      });
      kept++;
    }

    const refund = failed * refundPerFailedStill();
    if (kept === 0) {
      // Nothing to choose from: give the whole stills charge back.
      const full = reel.creditsCharged - reel.creditsRefunded;
      if (full > 0) await creditTenant({ tenantId, amount: full, reason: "refund", jobId: reelId, note: "No reel scene passed the garment check", actorId: null });
      await updateReel(reelId, { status: "failed", progress: 100, statusMessage: "No scene kept the garment faithful. Credits refunded.", creditsRefunded: reel.creditsRefunded + Math.max(0, full), error: "quality_gate", finishedAt: new Date() });
      return;
    }
    if (refund > 0) await creditTenant({ tenantId, amount: refund, reason: "refund", jobId: reelId, note: `${failed} reel scene(s) failed the garment check`, actorId: null });
    await updateReel(reelId, {
      status: "selecting",
      progress: 100,
      statusMessage: failed > 0 ? `${kept} of ${REEL_STILL_COUNT} scenes kept the garment faithful. ${failed} hidden and refunded.` : "Pick the scenes for your reel",
      creditsRefunded: reel.creditsRefunded + refund,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[reel] ${reelId} stills failed:`, message);
    const refund = Math.max(0, reel.creditsCharged - reel.creditsRefunded - kept * refundPerFailedStill());
    if (refund > 0) await creditTenant({ tenantId, amount: refund, reason: "refund", jobId: reelId, note: "Reel scenes failed", actorId: null });
    const nonRetryable = err instanceof StoryboardProviderError && !err.retryable;
    await updateReel(reelId, {
      status: kept > 0 ? "selecting" : "failed",
      progress: 100,
      statusMessage: kept > 0 ? `${kept} scenes are ready; the rest could not be made and were refunded.` : nonRetryable ? "The scene generator declined this image. Credits refunded." : "Something went wrong while sketching scenes. Credits refunded.",
      creditsRefunded: reel.creditsRefunded + refund,
      error: message.slice(0, 500),
      finishedAt: kept > 0 ? null : new Date(),
    });
  }
}

/* ---------------------------- animation --------------------------- */

/**
 * Animate the confirmed stills in arc order, then assemble the clips into
 * one reel. Each failed clip is refunded on its own; the reel still finishes
 * with whatever clips succeeded.
 */
export async function runReelAnimate(reelId: string): Promise<void> {
  const reel = await getReelForWorker(reelId);
  if (!reel || !["animating", "assembling"].includes(reel.status)) return;
  const { tenantId } = reel;
  const storage = getStorage();
  const selectedIds = reel.selectedStillIds ?? [];
  const byId = new Map(reel.assets.filter((a) => a.kind === "still").map((a) => [a.id, a]));
  const selected = orderForArc(selectedIds.map((id) => byId.get(id)).filter((a): a is ReelAsset => Boolean(a)));
  if (selected.length === 0) {
    await updateReel(reelId, { status: "failed", progress: 100, statusMessage: "No scenes were selected.", error: "no_selection", finishedAt: new Date() });
    return;
  }
  // A clip already stored for a still (a worker restart mid-reel) is reused, not re-charged.
  const existingClips = new Map(reel.assets.filter((a) => a.kind === "clip" && a.sourceAssetId).map((a) => [a.sourceAssetId!, a]));

  const clips: Array<{ still: ReelAsset; asset: ReelAsset }> = [];
  let failed = 0;
  let refund = 0;
  try {
    for (let i = 0; i < selected.length; i++) {
      const still = selected[i];
      const reused = existingClips.get(still.id);
      if (reused) {
        clips.push({ still, asset: reused });
        continue;
      }
      await setReelProgress(reelId, "animating", Math.round(3 + (i / selected.length) * 72), `Bringing scene ${i + 1} of ${selected.length} to life · ${still.sceneLabel}`);
      const prompt = motionPrompt({ shotType: still.shotType, analysis: reel.garment.analysis ?? null, title: reel.garment.title, vibe: reel.vibe, sceneLabel: still.sceneLabel });
      try {
        const image = await storage.get(still.storageKey);
        const out = await animateWithFailover({ image, prompt, negativePrompt: NEGATIVE_PROMPT, durationSec: CLIP_SECONDS, aspect: "9:16", shotType: still.shotType, timeoutMs: CLIP_TIMEOUT_MS });
        const assetId = newId("rcl");
        const storageKey = keys.reelClip(tenantId, reelId, assetId);
        await storage.put(storageKey, out.video, "video/mp4");
        const asset = await insertReelAsset({
          id: assetId,
          reelJobId: reelId,
          tenantId,
          kind: "clip",
          storageKey,
          thumbKey: still.thumbKey,
          width: out.width,
          height: out.height,
          durationSec: out.durationSec,
          sceneLabel: still.sceneLabel,
          shotType: still.shotType,
          prompt,
          provider: out.provider,
          sourceAssetId: still.id,
          orderIndex: i,
        });
        clips.push({ still, asset });
      } catch (err) {
        if (err instanceof VideoProviderError && !err.retryable && /No video provider/.test(err.message)) throw err;
        failed++;
        console.warn(`[reel] ${reelId} clip for "${still.sceneLabel}" failed:`, (err as Error).message);
        await creditTenant({ tenantId, amount: creditsForClip(), reason: "refund", jobId: reelId, note: `Clip "${still.sceneLabel}" could not be made`, actorId: null });
        refund += creditsForClip();
        await updateReel(reelId, { creditsRefunded: reel.creditsRefunded + refund });
      }
    }

    if (clips.length === 0) {
      await updateReel(reelId, { status: "failed", progress: 100, statusMessage: "None of the clips could be made. Clip credits refunded.", creditsRefunded: reel.creditsRefunded + refund, error: "no_clips", finishedAt: new Date() });
      return;
    }

    await setReelProgress(reelId, "assembling", 80, "Stitching the reel");
    const boutique = await boutiqueName(tenantId);
    const buffers = await Promise.all(clips.map((c) => storage.get(c.asset.storageKey)));
    const assembled = await assembleReel({ clips: buffers, caption: reel.caption, boutiqueName: boutique });

    await setReelProgress(reelId, "assembling", 94, "Saving");
    const outputKey = keys.reelOutput(tenantId, reelId);
    const coverKey = keys.reelCover(tenantId, reelId);
    const firstStill = await storage.get(clips[0].still.storageKey);
    const cover = await sharp(firstStill).resize(720, 1280, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
    await storage.put(outputKey, assembled.video, "video/mp4");
    await storage.put(coverKey, cover, "image/jpeg");

    const status = failed > 0 ? "partially_completed" : "completed";
    await updateReel(reelId, {
      status,
      progress: 100,
      statusMessage: failed > 0 ? `${clips.length} of ${selected.length} clips made it in. The rest were refunded.` : "Your reel is ready",
      outputKey,
      coverKey,
      durationSec: assembled.durationSec,
      creditsRefunded: reel.creditsRefunded + refund,
      error: null,
      finishedAt: new Date(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[reel] ${reelId} animate failed:`, message);
    // Refund every clip that was paid for but not delivered in a finished reel.
    const outstanding = Math.max(0, (selected.length - failed) * creditsForClip());
    if (outstanding > 0) await creditTenant({ tenantId, amount: outstanding, reason: "refund", jobId: reelId, note: "Reel could not be finished", actorId: null });
    await updateReel(reelId, {
      status: "failed",
      progress: 100,
      statusMessage: /No video provider/.test(message) ? "Reels are temporarily unavailable. Clip credits refunded." : "Something went wrong while making the reel. Clip credits refunded.",
      creditsRefunded: reel.creditsRefunded + refund + outstanding,
      error: message.slice(0, 500),
      finishedAt: new Date(),
    });
  }
}

async function boutiqueName(tenantId: string): Promise<string> {
  const db = await getDb();
  const org = await db.query.organization.findFirst({ where: eq(schema.organization.id, tenantId) });
  return org?.name ?? "Your boutique";
}
