"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/auth/session";
import { getImage } from "@/lib/dal/jobs";
import { countRecentReels, createReel, findReelByIdempotencyKey, getReel, updateReel } from "@/lib/dal/reels";
import { chargeCredits, InsufficientCreditsError, SpendCapError } from "@/lib/dal/tenants";
import { creditsForClips, creditsForReelStills, REEL_MAX_SELECTION } from "@/lib/dal/pricing";
import { orderForArc, selectionIsValid } from "@/lib/reels/arc";
import { getQueue } from "@/lib/queue";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/dal/audit";
import { clientIp, enforceLimit, limitMessage } from "@/lib/security/request";
import { env } from "@/env";
import type { ActionResult } from "./garments";

const startSchema = z.object({
  imageId: z.string().min(1),
  vibe: z.enum(["everyday", "festive", "editorial"]),
  idempotencyKey: z.string().min(8).max(80),
});

/** Charge the stills up front and queue the storyboard. */
export async function startReelStills(input: z.input<typeof startSchema>): Promise<ActionResult<{ reelId: string; credits: number }>> {
  const ctx = await requireTenant();
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { imageId, vibe, idempotencyKey } = parsed.data;

  const existing = await findReelByIdempotencyKey(ctx.tenant.id, idempotencyKey);
  if (existing) return { ok: true, data: { reelId: existing.id, credits: existing.creditsCharged } };

  const image = await getImage(ctx.tenant.id, imageId);
  if (!image || image.garment.deletedAt) return { ok: false, error: "That image is no longer available." };

  const limit = await enforceLimit("reel", { tenantId: ctx.tenant.id, userId: ctx.user.id });
  if (!limit.ok) return { ok: false, error: limitMessage("reel", limit) };
  const recent = await countRecentReels(ctx.tenant.id, 60 * 60 * 1000);
  if (recent >= Math.max(5, Math.floor(env.TENANT_JOBS_PER_HOUR / 4))) return { ok: false, error: "You have reached the hourly reel limit. Please try again shortly." };

  const credits = creditsForReelStills();
  const reelId = newId("reel");
  await createReel({
    id: reelId,
    tenantId: ctx.tenant.id,
    garmentId: image.garmentId,
    sourceImageId: image.id,
    vibe,
    status: "queued",
    progress: 0,
    statusMessage: "Waiting in queue",
    creditsCharged: 0,
    idempotencyKey,
    createdBy: ctx.user.id,
  });
  try {
    await chargeCredits({ tenantId: ctx.tenant.id, amount: credits, jobId: reelId, actorId: ctx.user.id });
  } catch (err) {
    await updateReel(reelId, { status: "failed", progress: 100, statusMessage: "Not started", error: (err as Error).message, finishedAt: new Date() });
    if (err instanceof InsufficientCreditsError) return { ok: false, error: `You need ${err.needed} credits for the scenes and have ${err.balance}. Top up to continue.` };
    if (err instanceof SpendCapError) return { ok: false, error: "Today's spend cap for this boutique has been reached." };
    throw err;
  }
  await updateReel(reelId, { creditsCharged: credits });
  await getQueue().enqueue({ type: "reel-stills", tenantId: ctx.tenant.id, reelId });
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "reel.start", targetType: "reel", targetId: reelId, metadata: { credits, vibe, imageId }, ip: await clientIp() });
  revalidatePath(`/gallery/${image.garmentId}`);
  return { ok: true, data: { reelId, credits } };
}

const confirmSchema = z.object({
  reelId: z.string().min(1),
  stillIds: z.array(z.string().min(1)).min(1).max(REEL_MAX_SELECTION),
  caption: z.string().trim().max(80).optional().nullable(),
  idempotencyKey: z.string().min(8).max(80),
});

/** Charge the clips for the chosen stills and queue the animation. */
export async function confirmReelSelection(input: z.input<typeof confirmSchema>): Promise<ActionResult<{ reelId: string; credits: number }>> {
  const ctx = await requireTenant();
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick between three and six scenes." };
  const { reelId, stillIds, caption, idempotencyKey } = parsed.data;

  const reel = await getReel(ctx.tenant.id, reelId);
  if (!reel) return { ok: false, error: "Reel not found." };
  if (reel.confirmKey === idempotencyKey) return { ok: true, data: { reelId, credits: creditsForClips((reel.selectedStillIds ?? []).length) } };
  if (reel.status !== "selecting") return { ok: false, error: reel.status === "failed" ? "This reel has failed. Start a new one." : "This reel is already being made." };

  const stills = reel.assets.filter((a) => a.kind === "still");
  if (!selectionIsValid(stillIds, stills)) return { ok: false, error: "Pick between three and six of the scenes shown." };
  const ordered = orderForArc(stills.filter((s) => stillIds.includes(s.id))).map((s) => s.id);

  const credits = creditsForClips(ordered.length);
  try {
    await chargeCredits({ tenantId: ctx.tenant.id, amount: credits, jobId: reelId, actorId: ctx.user.id });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) return { ok: false, error: `You need ${err.needed} credits for ${ordered.length} clips and have ${err.balance}. Top up or pick fewer scenes.` };
    if (err instanceof SpendCapError) return { ok: false, error: "Today's spend cap for this boutique has been reached." };
    throw err;
  }
  await updateReel(reelId, {
    status: "animating",
    progress: 0,
    statusMessage: "Waiting in queue",
    selectedStillIds: ordered,
    caption: caption?.trim() ? caption.trim() : null,
    confirmKey: idempotencyKey,
    creditsCharged: reel.creditsCharged + credits,
    error: null,
    finishedAt: null,
  });
  await getQueue().enqueue({ type: "reel-animate", tenantId: ctx.tenant.id, reelId });
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "reel.confirm", targetType: "reel", targetId: reelId, metadata: { credits, clips: ordered.length }, ip: await clientIp() });
  return { ok: true, data: { reelId, credits } };
}

/** A failed storyboard: start a fresh reel from the same image and vibe. */
export async function retryReelStills(reelId: string, idempotencyKey: string): Promise<ActionResult<{ reelId: string; credits: number }>> {
  const ctx = await requireTenant();
  const reel = await getReel(ctx.tenant.id, reelId);
  if (!reel) return { ok: false, error: "Reel not found." };
  if (reel.status !== "failed") return { ok: false, error: "This reel is still in progress." };
  return startReelStills({ imageId: reel.sourceImageId, vibe: reel.vibe, idempotencyKey });
}

/**
 * A failed animation: charge the selection again and re-run it. Clips that
 * were already made are reused by the worker, so only missing ones cost.
 */
export async function retryReelAnimate(reelId: string, idempotencyKey: string): Promise<ActionResult<{ reelId: string; credits: number }>> {
  const ctx = await requireTenant();
  const reel = await getReel(ctx.tenant.id, reelId);
  if (!reel) return { ok: false, error: "Reel not found." };
  if (reel.confirmKey === idempotencyKey) return { ok: true, data: { reelId, credits: 0 } };
  if (reel.status !== "failed" || !(reel.selectedStillIds ?? []).length) return { ok: false, error: "There is nothing to retry on this reel." };
  const done = new Set(reel.assets.filter((a) => a.kind === "clip").map((a) => a.sourceAssetId));
  const missing = (reel.selectedStillIds ?? []).filter((id) => !done.has(id)).length;
  const credits = creditsForClips(missing);
  if (credits > 0) {
    try {
      await chargeCredits({ tenantId: ctx.tenant.id, amount: credits, jobId: reelId, actorId: ctx.user.id });
    } catch (err) {
      if (err instanceof InsufficientCreditsError) return { ok: false, error: `You need ${err.needed} credits to retry and have ${err.balance}.` };
      if (err instanceof SpendCapError) return { ok: false, error: "Today's spend cap for this boutique has been reached." };
      throw err;
    }
  }
  await updateReel(reelId, { status: "animating", progress: 0, statusMessage: "Waiting in queue", confirmKey: idempotencyKey, creditsCharged: reel.creditsCharged + credits, error: null, finishedAt: null });
  await getQueue().enqueue({ type: "reel-animate", tenantId: ctx.tenant.id, reelId });
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "reel.retry", targetType: "reel", targetId: reelId, metadata: { credits, missing } });
  return { ok: true, data: { reelId, credits } };
}

/** Owner changed their mind before confirming: nothing more is charged; the stills stay in the gallery. */
export async function abandonReel(reelId: string): Promise<ActionResult> {
  const ctx = await requireTenant();
  const reel = await getReel(ctx.tenant.id, reelId);
  if (!reel) return { ok: false, error: "Reel not found." };
  if (reel.status !== "selecting") return { ok: false, error: "This reel cannot be abandoned now." };
  await updateReel(reelId, { status: "failed", progress: 100, statusMessage: "Not animated", error: "abandoned", finishedAt: new Date() });
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "reel.abandon", targetType: "reel", targetId: reelId });
  return { ok: true, data: undefined };
}
