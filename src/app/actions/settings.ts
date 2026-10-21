"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRole, requireTenant } from "@/lib/auth/session";
import { creditTenant, updateTenantSettings } from "@/lib/dal/tenants";
import { getBackdrop, getBaseModel } from "@/lib/base-models/catalog";
import { audit } from "@/lib/dal/audit";
import { getAuth } from "@/lib/auth/auth";
import { isProd } from "@/env";
import { setBoutiqueContact } from "@/lib/dal/share";
import { getDb, schema } from "@/lib/db";
import { getStorage, keys } from "@/lib/storage";
import { eq } from "drizzle-orm";
import type { ActionResult } from "./garments";

const defaultsSchema = z.object({
  defaultBaseModelId: z.string(),
  defaultBackdrop: z.string(),
  defaultVariations: z.number().int().min(1).max(4),
  watermarkEnabled: z.boolean(),
  autoGenerate: z.boolean(),
});

export async function saveDefaults(input: z.input<typeof defaultsSchema>): Promise<ActionResult> {
  const ctx = await requireRole(["owner", "admin"]);
  const parsed = defaultsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid settings." };
  if (!getBaseModel(parsed.data.defaultBaseModelId)) return { ok: false, error: "Unknown model." };
  if (!getBackdrop(parsed.data.defaultBackdrop)) return { ok: false, error: "Unknown backdrop." };
  await updateTenantSettings(ctx.tenant.id, parsed.data);
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "settings.update", metadata: parsed.data });
  revalidatePath("/settings");
  revalidatePath("/studio");
  return { ok: true, data: undefined };
}

export async function inviteMember(email: string, role: "admin" | "member"): Promise<ActionResult> {
  const ctx = await requireRole(["owner", "admin"]);
  const clean = z.string().email().safeParse(email.trim().toLowerCase());
  if (!clean.success) return { ok: false, error: "Enter a valid email address." };
  const auth = await getAuth();
  try {
    await auth.api.createInvitation({
      headers: await headers(),
      body: { email: clean.data, role, organizationId: ctx.tenant.id },
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message || "Could not send the invitation." };
  }
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "member.invite", metadata: { email: clean.data, role } });
  revalidatePath("/settings");
  return { ok: true, data: undefined };
}

export async function removeMember(memberId: string): Promise<ActionResult> {
  const ctx = await requireRole(["owner"]);
  const auth = await getAuth();
  try {
    await auth.api.removeMember({ headers: await headers(), body: { memberIdOrEmail: memberId, organizationId: ctx.tenant.id } });
  } catch (err) {
    return { ok: false, error: (err as Error).message || "Could not remove that member." };
  }
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "member.remove", targetType: "member", targetId: memberId });
  revalidatePath("/settings");
  return { ok: true, data: undefined };
}

/** Development only: top up credits without a payment gateway. */
export async function grantDevCredits(amount: number): Promise<ActionResult<{ balance: number }>> {
  if (isProd) return { ok: false, error: "Not available." };
  const ctx = await requireRole(["owner", "admin"]);
  const n = Math.min(1000, Math.max(1, Math.floor(amount)));
  const balance = await creditTenant({ tenantId: ctx.tenant.id, amount: n, reason: "adjustment", note: "Development top-up", actorId: ctx.user.id });
  revalidatePath("/billing");
  return { ok: true, data: { balance } };
}

export async function setActiveBoutique(organizationId: string): Promise<ActionResult> {
  await requireTenant();
  const auth = await getAuth();
  try {
    await auth.api.setActiveOrganization({ headers: await headers(), body: { organizationId } });
  } catch {
    return { ok: false, error: "Could not switch boutique." };
  }
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

const contactSchema = z.object({
  whatsapp: z.string().trim().regex(/^[+]?[0-9 ]{8,16}$/, "Enter the number with country code, e.g. +91 98765 43210").or(z.literal("")),
  instagram: z.string().trim().max(60).or(z.literal("")),
  city: z.string().trim().max(60).or(z.literal("")),
});

/** Where customers reach the boutique from a shared link. */
export async function saveContact(input: z.input<typeof contactSchema>): Promise<ActionResult> {
  const ctx = await requireRole(["owner", "admin"]);
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details." };
  await setBoutiqueContact(ctx.tenant.id, {
    whatsapp: parsed.data.whatsapp ? parsed.data.whatsapp.replace(/[^0-9+]/g, "") : undefined,
    instagram: parsed.data.instagram ? parsed.data.instagram.replace(/^@/, "") : undefined,
    city: parsed.data.city || undefined,
  });
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "settings.contact" });
  revalidatePath("/settings");
  return { ok: true, data: undefined };
}

/** Owner only. Removes the boutique, every photo and every generated image. */
export async function deleteBoutique(confirmName: string): Promise<ActionResult> {
  const ctx = await requireRole(["owner"]);
  if (confirmName.trim() !== ctx.tenant.name) return { ok: false, error: "Type the boutique name exactly to confirm." };
  const db = await getDb();
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "tenant.delete", metadata: { name: ctx.tenant.name } });
  await getStorage().deletePrefix(keys.tenantPrefix(ctx.tenant.id)).catch(() => {});
  await db.delete(schema.organization).where(eq(schema.organization.id, ctx.tenant.id));
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
