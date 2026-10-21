"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, requireTenant } from "@/lib/auth/session";
import { getStorage, keys, MAX_UPLOAD_BYTES, UPLOAD_URL_TTL_SECONDS } from "@/lib/storage";
import { ingestUpload, InvalidImageError } from "@/lib/images";
import { newId } from "@/lib/ids";
import { createGarment, getGarment, renameGarment, softDeleteGarment } from "@/lib/dal/garments";
import { getQueue } from "@/lib/queue";
import { audit } from "@/lib/dal/audit";
import { clientIp, rateLimit } from "@/lib/security/request";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const signSchema = z.object({
  contentType: z.string(),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

/** Step 1: hand the browser a short-lived URL to upload directly to storage. */
export async function requestUploadUrl(input: z.input<typeof signSchema>): Promise<ActionResult<{ uploadId: string; url: string; method: string; headers: Record<string, string> }>> {
  const ctx = await requireTenant();
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload request." };
  if (!ALLOWED_TYPES.has(parsed.data.contentType)) return { ok: false, error: "Please upload a JPEG, PNG, WebP or HEIC photo." };
  const rl = rateLimit(`upload:${ctx.tenant.id}`, 120, 60 * 60 * 1000);
  if (!rl.ok) return { ok: false, error: `Upload limit reached. Try again in ${rl.retryAfterSec}s.` };

  const uploadId = newId("up");
  const key = keys.upload(ctx.tenant.id, uploadId);
  const signed = await getStorage().signUpload(key, parsed.data.contentType, parsed.data.size, UPLOAD_URL_TTL_SECONDS);
  return { ok: true, data: { uploadId, url: signed.url, method: signed.method, headers: signed.headers } };
}

/** Step 2: the file is in storage; validate, re-encode, create the garment, queue analysis. */
export async function registerGarment(uploadId: string): Promise<ActionResult<{ garmentId: string }>> {
  const ctx = await requireTenant();
  if (!/^up_[a-z0-9]+$/.test(uploadId)) return { ok: false, error: "Invalid upload." };
  const storage = getStorage();
  const uploadKey = keys.upload(ctx.tenant.id, uploadId);
  if (!(await storage.exists(uploadKey))) return { ok: false, error: "Upload not found. Please try again." };

  try {
    const raw = await storage.get(uploadKey);
    const { original, thumb, width, height } = await ingestUpload(raw);
    const garmentId = newId("gar");
    const originalKey = keys.garmentOriginal(ctx.tenant.id, garmentId);
    const thumbKey = keys.garmentThumb(ctx.tenant.id, garmentId);
    await storage.put(originalKey, original, "image/jpeg");
    await storage.put(thumbKey, thumb, "image/jpeg");
    await storage.delete(uploadKey);

    await createGarment({
      id: garmentId,
      tenantId: ctx.tenant.id,
      originalKey,
      thumbKey,
      width,
      height,
      status: "uploaded",
      createdBy: ctx.user.id,
    });
    await getQueue().enqueue({ type: "analyze", tenantId: ctx.tenant.id, garmentId });
    await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "garment.create", targetType: "garment", targetId: garmentId, ip: await clientIp() });
    revalidatePath("/gallery");
    return { ok: true, data: { garmentId } };
  } catch (err) {
    await storage.delete(uploadKey).catch(() => {});
    if (err instanceof InvalidImageError) return { ok: false, error: err.message };
    console.error("registerGarment failed", err);
    return { ok: false, error: "We could not process that photo. Please try another." };
  }
}

export async function renameGarmentAction(garmentId: string, title: string): Promise<ActionResult> {
  const ctx = await requireTenant();
  const clean = title.trim().slice(0, 120);
  if (!clean) return { ok: false, error: "Title cannot be empty." };
  if (!(await getGarment(ctx.tenant.id, garmentId))) return { ok: false, error: "Not found." };
  await renameGarment(ctx.tenant.id, garmentId, clean);
  revalidatePath(`/gallery/${garmentId}`);
  return { ok: true, data: undefined };
}

/** Soft-delete now; storage objects are purged by the retention sweep within 24 h. */
export async function deleteGarmentAction(garmentId: string): Promise<ActionResult> {
  const ctx = await requireRole(["owner", "admin"]);
  const garment = await getGarment(ctx.tenant.id, garmentId);
  if (!garment) return { ok: false, error: "Not found." };
  await softDeleteGarment(ctx.tenant.id, garmentId);
  await getStorage().deletePrefix(keys.garmentPrefix(ctx.tenant.id, garmentId)).catch(() => {});
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "garment.delete", targetType: "garment", targetId: garmentId, ip: await clientIp() });
  revalidatePath("/gallery");
  return { ok: true, data: undefined };
}
