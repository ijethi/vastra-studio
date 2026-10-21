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
import type { ActionResult } from "./garments";

const defaultsSchema = z.object({
  defaultBaseModelId: z.string(),
  defaultBackdrop: z.string(),
  defaultVariations: z.number().int().min(1).max(4),
  watermarkEnabled: z.boolean(),
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
