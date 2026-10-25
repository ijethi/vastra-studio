"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { audit } from "@/lib/dal/audit";
import { clientIp } from "@/lib/security/request";
import { CONTENT_TAG, invalidateContentMemo } from "@/lib/dal/content";
import {
  deleteBackdrop,
  deleteCreditPack,
  deleteReelScene,
  seedContent,
  setAppContent,
  setBaseModelActive,
  setBaseModelImage,
  upsertBackdrop,
  upsertBaseModel,
  upsertCreditPack,
  upsertReelScene,
} from "@/lib/content/store";
import { APP_CONTENT_KEYS, coerceAppContent, type AppContentKey } from "@/lib/content/types";
import { getStorage } from "@/lib/storage";
import type { ActionResult } from "./garments";

/**
 * Admin console mutations for the editable content. Platform admins only;
 * every change is written to the audit log and both caches (the request
 * cache tagged "content" and the in-process memo) are dropped so the studio,
 * billing and reels pages see the edit on the next request.
 */

const id = z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,60}$/, "Use lowercase letters, digits and dashes (e.g. bm-curvy-dusky-30s).");
const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Hex colour like #F4EFE6");
const text = (max: number) => z.string().trim().min(1).max(max);
const sort = z.coerce.number().int().min(0).max(10_000).default(0);
const active = z.coerce.boolean().default(true);

async function changed(action: string, targetType: string, targetId: string, actorId: string, metadata?: Record<string, unknown>) {
  await audit({ tenantId: null, actorId, action, targetType, targetId, metadata, ip: await clientIp() });
  invalidateContentMemo();
  updateTag(CONTENT_TAG);
  revalidatePath("/admin/content", "layout");
}

function fail(err: unknown): ActionResult {
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Check the fields." };
  return { ok: false, error: err instanceof Error ? err.message : "Could not save." };
}

/* ------------------------------ base models ----------------------------- */

const baseModelSchema = z.object({
  id,
  label: text(80),
  bodyType: z.enum(["slim", "regular", "curvy", "plus"]),
  skinTone: z.enum(["fair", "wheatish", "dusky", "deep"]),
  ageRange: z.enum(["20s", "30s", "40s"]),
  pose: z.enum(["front", "three-quarter"]).default("front"),
  imageUrl: z.string().trim().max(500).optional().or(z.literal("")),
  licenceNote: z.string().trim().max(200).default(""),
  active,
  sort,
});

export async function saveBaseModel(input: z.input<typeof baseModelSchema>): Promise<ActionResult> {
  const ctx = await requirePlatformAdmin();
  try {
    const data = baseModelSchema.parse(input);
    const db = await getDb();
    const existing = (await import("@/lib/content/store")).readBaseModelRows(db).then((rows) => rows.find((r) => r.id === data.id));
    const prior = await existing;
    await upsertBaseModel(db, {
      id: data.id,
      label: data.label,
      bodyType: data.bodyType,
      skinTone: data.skinTone,
      ageRange: data.ageRange,
      pose: data.pose,
      // An external URL replaces an uploaded render; an empty field keeps whatever is in storage.
      imageUrl: data.imageUrl ? data.imageUrl : null,
      imageKey: data.imageUrl ? null : (prior?.imageKey ?? null),
      width: prior?.width ?? 864,
      height: prior?.height ?? 1296,
      licenceNote: data.licenceNote,
      active: data.active,
      sort: data.sort,
    });
    await changed("content.base_model.save", "base_model", data.id, ctx.user.id, { label: data.label, active: data.active });
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function setBaseModelActiveAction(modelId: string, value: boolean): Promise<ActionResult> {
  const ctx = await requirePlatformAdmin();
  try {
    const clean = id.parse(modelId);
    await setBaseModelActive(await getDb(), clean, value);
    await changed(value ? "content.base_model.activate" : "content.base_model.deactivate", "base_model", clean, ctx.user.id);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/** Remove the uploaded preview (the development placeholder shows again). The library renders per backdrop are kept. */
export async function clearBaseModelImage(modelId: string): Promise<ActionResult> {
  const ctx = await requirePlatformAdmin();
  try {
    const clean = id.parse(modelId);
    const db = await getDb();
    const rows = await (await import("@/lib/content/store")).readBaseModelRows(db);
    const row = rows.find((r) => r.id === clean);
    if (row?.imageKey) await getStorage().delete(row.imageKey).catch(() => {});
    await setBaseModelImage(db, clean, null);
    await changed("content.base_model.image.clear", "base_model", clean, ctx.user.id);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------- backdrops ------------------------------ */

const backdropSchema = z.object({
  id,
  label: text(60),
  description: z.string().trim().max(160).default(""),
  hex,
  kind: z.enum(["studio", "interior", "outdoor", "festive"]),
  active,
  sort,
});

export async function saveBackdrop(input: z.input<typeof backdropSchema>): Promise<ActionResult> {
  const ctx = await requirePlatformAdmin();
  try {
    const data = backdropSchema.parse(input);
    await upsertBackdrop(await getDb(), { ...data, hex: data.hex.toUpperCase() });
    await changed("content.backdrop.save", "backdrop", data.id, ctx.user.id, { label: data.label, active: data.active });
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteBackdropAction(backdropId: string): Promise<ActionResult> {
  const ctx = await requirePlatformAdmin();
  try {
    const clean = id.parse(backdropId);
    await deleteBackdrop(await getDb(), clean);
    await changed("content.backdrop.delete", "backdrop", clean, ctx.user.id);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------ credit packs ---------------------------- */

const packSchema = z.object({
  id,
  label: text(40),
  blurb: z.string().trim().max(80).default(""),
  credits: z.coerce.number().int().min(1).max(1_000_000),
  /** Whole rupees in the form; stored in paise. */
  amountRupees: z.coerce.number().min(1).max(10_000_000),
  currency: z.enum(["INR"]).default("INR"),
  active,
  sort,
});

export async function saveCreditPack(input: z.input<typeof packSchema>): Promise<ActionResult> {
  const ctx = await requirePlatformAdmin();
  try {
    const data = packSchema.parse(input);
    await upsertCreditPack(await getDb(), {
      id: data.id,
      label: data.label,
      blurb: data.blurb,
      credits: data.credits,
      amountMinor: Math.round(data.amountRupees * 100),
      currency: data.currency,
      active: data.active,
      sort: data.sort,
    });
    await changed("content.credit_pack.save", "credit_pack", data.id, ctx.user.id, { credits: data.credits, amountMinor: Math.round(data.amountRupees * 100), active: data.active });
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteCreditPackAction(packId: string): Promise<ActionResult> {
  const ctx = await requirePlatformAdmin();
  try {
    const clean = id.parse(packId);
    await deleteCreditPack(await getDb(), clean);
    await changed("content.credit_pack.delete", "credit_pack", clean, ctx.user.id);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------- reel scenes ---------------------------- */

const sceneSchema = z.object({
  id,
  vibe: z.enum(["everyday", "festive", "editorial"]),
  label: text(60),
  shotType: z.enum(["wide-hook", "full-body", "movement", "detail", "hero-portrait"]),
  prompt: text(600),
  active,
  sort,
});

export async function saveReelScene(input: z.input<typeof sceneSchema>): Promise<ActionResult> {
  const ctx = await requirePlatformAdmin();
  try {
    const data = sceneSchema.parse(input);
    await upsertReelScene(await getDb(), data);
    await changed("content.reel_scene.save", "reel_scene", data.id, ctx.user.id, { vibe: data.vibe, label: data.label, active: data.active });
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteReelSceneAction(sceneId: string): Promise<ActionResult> {
  const ctx = await requirePlatformAdmin();
  try {
    const clean = id.parse(sceneId);
    await deleteReelScene(await getDb(), clean);
    await changed("content.reel_scene.delete", "reel_scene", clean, ctx.user.id);
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

/* -------------------------------- app copy ------------------------------ */

export async function saveAppContent(key: string, json: string): Promise<ActionResult> {
  const ctx = await requirePlatformAdmin();
  if (!APP_CONTENT_KEYS.includes(key as AppContentKey)) return { ok: false, error: "Unknown content key." };
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, error: "That is not valid JSON." };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "The value must be a JSON object." };
  if (json.length > 20_000) return { ok: false, error: "Keep the value under 20 KB." };
  // Store the coerced shape so a typo in a field name cannot hide a default.
  const clean = coerceAppContent(key as AppContentKey, value);
  await setAppContent(await getDb(), key as AppContentKey, clean, ctx.user.id);
  await changed("content.app_content.save", "app_content", key, ctx.user.id);
  return { ok: true, data: undefined };
}

/** Restore every default row (overwrites rows with the same ids; admin-added rows are kept). */
export async function restoreDefaultContent(): Promise<ActionResult<{ summary: string }>> {
  const ctx = await requirePlatformAdmin();
  const report = await seedContent(await getDb(), { force: true, actorId: ctx.user.id });
  await changed("content.restore_defaults", "content", "all", ctx.user.id, report);
  return { ok: true, data: { summary: Object.entries(report).map(([k, n]) => `${k} ${n}`).join(", ") } };
}
