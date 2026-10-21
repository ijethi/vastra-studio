import "server-only";
import { and, asc, count, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { JobStatus } from "@/lib/db/schema";

export async function createJob(values: typeof schema.generationJobs.$inferInsert) {
  const db = await getDb();
  const [row] = await db.insert(schema.generationJobs).values(values).returning();
  return row;
}

export async function findJobByIdempotencyKey(tenantId: string, key: string) {
  const db = await getDb();
  return db.query.generationJobs.findFirst({
    where: and(eq(schema.generationJobs.tenantId, tenantId), eq(schema.generationJobs.idempotencyKey, key)),
  });
}

export async function getJob(tenantId: string, id: string) {
  const db = await getDb();
  return db.query.generationJobs.findFirst({
    where: and(eq(schema.generationJobs.id, id), eq(schema.generationJobs.tenantId, tenantId)),
    with: { images: { orderBy: asc(schema.generatedImages.createdAt) }, garment: true },
  });
}

/** Worker-side read: trusts the job id because it came from our own queue. */
export async function getJobForWorker(id: string) {
  const db = await getDb();
  return db.query.generationJobs.findFirst({ where: eq(schema.generationJobs.id, id), with: { garment: true } });
}

export async function updateJob(id: string, patch: Partial<typeof schema.generationJobs.$inferInsert>) {
  const db = await getDb();
  await db.update(schema.generationJobs).set(patch).where(eq(schema.generationJobs.id, id));
}

export async function setJobProgress(id: string, status: JobStatus, progress: number, statusMessage: string) {
  await updateJob(id, { status, progress, statusMessage });
}

export async function insertImage(values: typeof schema.generatedImages.$inferInsert) {
  const db = await getDb();
  const [row] = await db.insert(schema.generatedImages).values(values).returning();
  return row;
}

export async function getImage(tenantId: string, id: string) {
  const db = await getDb();
  return db.query.generatedImages.findFirst({
    where: and(eq(schema.generatedImages.id, id), eq(schema.generatedImages.tenantId, tenantId)),
    with: { garment: true },
  });
}

export async function setImageAccepted(tenantId: string, id: string, accepted: boolean) {
  const db = await getDb();
  await db
    .update(schema.generatedImages)
    .set({ accepted })
    .where(and(eq(schema.generatedImages.id, id), eq(schema.generatedImages.tenantId, tenantId)));
}

export async function listImagesForGarment(tenantId: string, garmentId: string) {
  const db = await getDb();
  return db.query.generatedImages.findMany({
    where: and(eq(schema.generatedImages.tenantId, tenantId), eq(schema.generatedImages.garmentId, garmentId)),
    orderBy: desc(schema.generatedImages.createdAt),
  });
}

export async function listJobsForGarment(tenantId: string, garmentId: string) {
  const db = await getDb();
  return db.query.generationJobs.findMany({
    where: and(eq(schema.generationJobs.tenantId, tenantId), eq(schema.generationJobs.garmentId, garmentId)),
    orderBy: desc(schema.generationJobs.createdAt),
    with: { images: { orderBy: asc(schema.generatedImages.createdAt) } },
  });
}

export async function countRecentJobs(tenantId: string, sinceMs: number) {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(schema.generationJobs)
    .where(and(eq(schema.generationJobs.tenantId, tenantId), gte(schema.generationJobs.createdAt, new Date(Date.now() - sinceMs))));
  return Number(row?.n ?? 0);
}

/** Jobs that were in flight when a worker died; re-queued at boot. */
export async function listUnfinishedJobIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.generationJobs.id })
    .from(schema.generationJobs)
    .where(inArray(schema.generationJobs.status, ["queued", "analysing", "generating", "finishing", "gating"]))
    .orderBy(asc(schema.generationJobs.createdAt));
  return rows.map((r) => r.id);
}

export async function listRecentJobsAllTenants(limit = 50) {
  const db = await getDb();
  return db.query.generationJobs.findMany({ orderBy: desc(schema.generationJobs.createdAt), limit, with: { garment: true } });
}
