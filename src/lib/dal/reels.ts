import "server-only";
import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { ReelStatus } from "@/lib/db/schema";

export async function createReel(values: typeof schema.reelJobs.$inferInsert) {
  const db = await getDb();
  const [row] = await db.insert(schema.reelJobs).values(values).returning();
  return row;
}

export async function findReelByIdempotencyKey(tenantId: string, key: string) {
  const db = await getDb();
  return db.query.reelJobs.findFirst({ where: and(eq(schema.reelJobs.tenantId, tenantId), eq(schema.reelJobs.idempotencyKey, key)) });
}

/** Tenant-scoped read with every asset, the garment and the hero image. */
export async function getReel(tenantId: string, id: string) {
  const db = await getDb();
  return db.query.reelJobs.findFirst({
    where: and(eq(schema.reelJobs.id, id), eq(schema.reelJobs.tenantId, tenantId)),
    with: { assets: { orderBy: asc(schema.reelAssets.orderIndex) }, garment: true, sourceImage: true },
  });
}

/** Worker-side read: trusts the id because it came from our own queue. */
export async function getReelForWorker(id: string) {
  const db = await getDb();
  return db.query.reelJobs.findFirst({
    where: eq(schema.reelJobs.id, id),
    with: { assets: { orderBy: asc(schema.reelAssets.orderIndex) }, garment: true, sourceImage: true },
  });
}

export async function updateReel(id: string, patch: Partial<typeof schema.reelJobs.$inferInsert>) {
  const db = await getDb();
  await db.update(schema.reelJobs).set(patch).where(eq(schema.reelJobs.id, id));
}

export async function setReelProgress(id: string, status: ReelStatus, progress: number, statusMessage: string) {
  await updateReel(id, { status, progress, statusMessage });
}

export async function insertReelAsset(values: typeof schema.reelAssets.$inferInsert) {
  const db = await getDb();
  const [row] = await db.insert(schema.reelAssets).values(values).returning();
  return row;
}

export async function listReelsForGarment(tenantId: string, garmentId: string) {
  const db = await getDb();
  return db.query.reelJobs.findMany({
    where: and(eq(schema.reelJobs.tenantId, tenantId), eq(schema.reelJobs.garmentId, garmentId)),
    orderBy: desc(schema.reelJobs.createdAt),
    with: { assets: { orderBy: asc(schema.reelAssets.orderIndex) } },
  });
}

export async function countRecentReels(tenantId: string, sinceMs: number) {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(schema.reelJobs)
    .where(and(eq(schema.reelJobs.tenantId, tenantId), gte(schema.reelJobs.createdAt, new Date(Date.now() - sinceMs))));
  return Number(row?.n ?? 0);
}

/** Reels a worker was processing when it died. "selecting" waits on the owner, so it is not here. */
export async function listUnfinishedReels(): Promise<Array<{ id: string; tenantId: string; status: ReelStatus }>> {
  const db = await getDb();
  return db
    .select({ id: schema.reelJobs.id, tenantId: schema.reelJobs.tenantId, status: schema.reelJobs.status })
    .from(schema.reelJobs)
    .where(inArray(schema.reelJobs.status, ["queued", "stills", "animating", "assembling"]))
    .orderBy(asc(schema.reelJobs.createdAt));
}
