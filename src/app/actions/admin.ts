"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getPlatformSetting, setPlatformSetting } from "@/lib/dal/platform";
import type { ProviderSwitches } from "@/lib/providers/tryon";
import type { TryOnProviderName } from "@/env";
import { audit } from "@/lib/dal/audit";
import type { ActionResult } from "./garments";

export async function setProviderEnabled(provider: TryOnProviderName, enabled: boolean): Promise<ActionResult> {
  const ctx = await requirePlatformAdmin();
  const current = (await getPlatformSetting<ProviderSwitches>("tryon.switches")) ?? {};
  current[provider] = { enabled };
  await setPlatformSetting("tryon.switches", current, ctx.user.id);
  await audit({ tenantId: null, actorId: ctx.user.id, action: "platform.provider.toggle", metadata: { provider, enabled } });
  revalidatePath("/admin");
  return { ok: true, data: undefined };
}
