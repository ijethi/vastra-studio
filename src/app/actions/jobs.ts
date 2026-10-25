"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/auth/session";
import { getGarment } from "@/lib/dal/garments";
import { countRecentJobs, createJob, findJobByIdempotencyKey, getImage, setImageAccepted, updateJob } from "@/lib/dal/jobs";
import { chargeCredits, creditsForRun, InsufficientCreditsError, SpendCapError } from "@/lib/dal/tenants";
import { getBackdrop, getBaseModel } from "@/lib/dal/content";
import { getQueue } from "@/lib/queue";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/dal/audit";
import { clientIp, enforceLimit, limitMessage } from "@/lib/security/request";
import { env } from "@/env";
import type { ActionResult } from "./garments";

const createSchema = z.object({
  garmentId: z.string().min(1),
  baseModelId: z.string().min(1),
  backdrop: z.string().min(1),
  variations: z.number().int().min(1).max(4),
  idempotencyKey: z.string().min(8).max(80),
});

export async function createGenerationJob(input: z.input<typeof createSchema>): Promise<ActionResult<{ jobId: string; credits: number }>> {
  const ctx = await requireTenant();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { garmentId, baseModelId, backdrop, variations, idempotencyKey } = parsed.data;

  // Retried submissions (double tap, flaky network) return the original job.
  const existing = await findJobByIdempotencyKey(ctx.tenant.id, idempotencyKey);
  if (existing) return { ok: true, data: { jobId: existing.id, credits: existing.creditsCharged } };

  const garment = await getGarment(ctx.tenant.id, garmentId);
  if (!garment) return { ok: false, error: "Garment not found." };
  if (garment.status === "unusable") return { ok: false, error: "This photo was flagged as unusable. Please upload a clearer one." };
  if (!(await getBaseModel(baseModelId))) return { ok: false, error: "Please choose a model." };
  if (!(await getBackdrop(backdrop))) return { ok: false, error: "Please choose a backdrop." };

  // Two fences: the shared sliding window (per user and per boutique, Redis-backed in production)
  // and the durable count of jobs this boutique created in the last hour.
  const limit = await enforceLimit("job", { tenantId: ctx.tenant.id, userId: ctx.user.id });
  if (!limit.ok) return { ok: false, error: limitMessage("job", limit) };
  const recent = await countRecentJobs(ctx.tenant.id, 60 * 60 * 1000);
  if (recent >= env.TENANT_JOBS_PER_HOUR) return { ok: false, error: "You have reached the hourly generation limit. Please try again shortly." };

  const credits = creditsForRun(variations);
  const jobId = newId("job");
  const job = await createJob({
    id: jobId,
    tenantId: ctx.tenant.id,
    garmentId,
    baseModelId,
    backdrop,
    variations,
    status: "queued",
    progress: 0,
    statusMessage: "Waiting in queue",
    creditsCharged: 0,
    idempotencyKey,
    createdBy: ctx.user.id,
  });

  try {
    await chargeCredits({ tenantId: ctx.tenant.id, amount: credits, jobId: job.id, actorId: ctx.user.id });
  } catch (err) {
    await updateJob(job.id, { status: "failed", progress: 100, statusMessage: "Not started", error: (err as Error).message, finishedAt: new Date() });
    if (err instanceof InsufficientCreditsError) return { ok: false, error: `You need ${err.needed} credits for this run and have ${err.balance}. Top up to continue.` };
    if (err instanceof SpendCapError) return { ok: false, error: "Today's spend cap for this boutique has been reached." };
    throw err;
  }
  await updateJob(job.id, { creditsCharged: credits });
  await getQueue().enqueue({ type: "generate", tenantId: ctx.tenant.id, jobId: job.id });
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "job.create", targetType: "job", targetId: job.id, metadata: { credits, variations, baseModelId, backdrop }, ip: await clientIp() });
  revalidatePath(`/gallery/${garmentId}`);
  return { ok: true, data: { jobId: job.id, credits } };
}

export async function acceptImageAction(imageId: string, accepted: boolean): Promise<ActionResult> {
  const ctx = await requireTenant();
  const image = await getImage(ctx.tenant.id, imageId);
  if (!image) return { ok: false, error: "Not found." };
  await setImageAccepted(ctx.tenant.id, imageId, accepted);
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: accepted ? "image.accept" : "image.unaccept", targetType: "image", targetId: imageId });
  revalidatePath(`/gallery/${image.garmentId}`);
  return { ok: true, data: undefined };
}
