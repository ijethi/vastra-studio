"use server";

import { requireTenant } from "@/lib/auth/session";
import { getGarment } from "@/lib/dal/garments";
import { getStorage, READ_URL_TTL_SECONDS } from "@/lib/storage";
import type { GarmentAnalysis } from "@/lib/db/schema";

export type GarmentSummary = {
  id: string;
  title: string;
  category: string;
  status: string;
  thumbUrl: string;
  analysis: GarmentAnalysis | null;
};

/** Polled by the studio while analysis runs. */
export async function getGarmentSummary(garmentId: string): Promise<GarmentSummary | null> {
  const ctx = await requireTenant();
  const g = await getGarment(ctx.tenant.id, garmentId);
  if (!g) return null;
  return {
    id: g.id,
    title: g.title,
    category: g.category,
    status: g.status,
    thumbUrl: await getStorage().signRead(g.thumbKey, READ_URL_TTL_SECONDS),
    analysis: g.analysis ?? null,
  };
}
