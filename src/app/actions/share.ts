"use server";

import { requireTenant } from "@/lib/auth/session";
import { getGarment } from "@/lib/dal/garments";
import { getImage } from "@/lib/dal/jobs";
import { createShareLink, revokeShareLink, type ShareTarget } from "@/lib/dal/share";
import { audit } from "@/lib/dal/audit";
import { clientIp, rateLimit } from "@/lib/security/request";
import type { ActionResult } from "./garments";

export async function createShareLinkAction(targetType: ShareTarget, targetId: string): Promise<ActionResult<{ id: string; url: string; expiresAt: string }>> {
  const ctx = await requireTenant();
  const rl = rateLimit(`share:${ctx.tenant.id}`, 200, 60 * 60 * 1000);
  if (!rl.ok) return { ok: false, error: "Too many links created. Try again in a little while." };

  const exists = targetType === "image" ? await getImage(ctx.tenant.id, targetId) : await getGarment(ctx.tenant.id, targetId);
  if (!exists) return { ok: false, error: "Not found." };

  const link = await createShareLink({ tenantId: ctx.tenant.id, targetType, targetId, createdBy: ctx.user.id, days: 30 });
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "share.create", targetType, targetId, metadata: { linkId: link.id }, ip: await clientIp() });
  return { ok: true, data: { id: link.id, url: link.url, expiresAt: link.expiresAt.toISOString() } };
}

export async function revokeShareLinkAction(id: string): Promise<ActionResult> {
  const ctx = await requireTenant();
  await revokeShareLink(ctx.tenant.id, id);
  await audit({ tenantId: ctx.tenant.id, actorId: ctx.user.id, action: "share.revoke", targetType: "share", targetId: id });
  return { ok: true, data: undefined };
}
