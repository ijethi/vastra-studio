import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { GarmentAnalysis } from "@/lib/db/schema";

export async function createGarment(values: typeof schema.garments.$inferInsert) {
  const db = await getDb();
  const [row] = await db.insert(schema.garments).values(values).returning();
  return row;
}

export async function getGarment(tenantId: string, id: string) {
  const db = await getDb();
  return db.query.garments.findFirst({
    where: and(eq(schema.garments.id, id), eq(schema.garments.tenantId, tenantId), isNull(schema.garments.deletedAt)),
  });
}

export async function listGarments(tenantId: string, limit = 60) {
  const db = await getDb();
  return db.query.garments.findMany({
    where: and(eq(schema.garments.tenantId, tenantId), isNull(schema.garments.deletedAt)),
    orderBy: desc(schema.garments.createdAt),
    limit,
    with: { images: { orderBy: desc(schema.generatedImages.createdAt), limit: 4 } },
  });
}

export async function setGarmentAnalysis(tenantId: string, id: string, analysis: GarmentAnalysis) {
  const db = await getDb();
  await db
    .update(schema.garments)
    .set({
      analysis,
      title: analysis.title || "Untitled piece",
      category: analysis.category,
      colour: analysis.colour || null,
      status: analysis.usable ? "ready" : "unusable",
    })
    .where(and(eq(schema.garments.id, id), eq(schema.garments.tenantId, tenantId)));
}

export async function setGarmentStatus(tenantId: string, id: string, status: string) {
  const db = await getDb();
  await db.update(schema.garments).set({ status }).where(and(eq(schema.garments.id, id), eq(schema.garments.tenantId, tenantId)));
}

export async function renameGarment(tenantId: string, id: string, title: string) {
  const db = await getDb();
  await db.update(schema.garments).set({ title }).where(and(eq(schema.garments.id, id), eq(schema.garments.tenantId, tenantId)));
}

export async function softDeleteGarment(tenantId: string, id: string) {
  const db = await getDb();
  await db
    .update(schema.garments)
    .set({ deletedAt: new Date(), status: "deleted" })
    .where(and(eq(schema.garments.id, id), eq(schema.garments.tenantId, tenantId)));
}
