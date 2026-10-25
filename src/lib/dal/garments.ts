import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { schema } from "@/lib/db";
import type { GarmentAnalysis } from "@/lib/db/schema";
import { scoped } from "./scope";

/** Every call here runs inside `scoped(tenantId, ...)`: the tenant is pinned for RLS and repeated in the predicate. */

export async function createGarment(values: typeof schema.garments.$inferInsert) {
  return scoped(values.tenantId, async (db) => {
    const [row] = await db.insert(schema.garments).values(values).returning();
    return row;
  });
}

export async function getGarment(tenantId: string, id: string) {
  return scoped(tenantId, (db) =>
    db.query.garments.findFirst({
      where: and(eq(schema.garments.id, id), eq(schema.garments.tenantId, tenantId), isNull(schema.garments.deletedAt)),
    }),
  );
}

export async function listGarments(tenantId: string, limit = 60) {
  return scoped(tenantId, (db) =>
    db.query.garments.findMany({
      where: and(eq(schema.garments.tenantId, tenantId), isNull(schema.garments.deletedAt)),
      orderBy: desc(schema.garments.createdAt),
      limit,
      with: {
        images: { orderBy: desc(schema.generatedImages.createdAt), limit: 4 },
        jobs: { orderBy: desc(schema.generationJobs.createdAt), limit: 1 },
      },
    }),
  );
}

export async function setGarmentAnalysis(tenantId: string, id: string, analysis: GarmentAnalysis) {
  await scoped(tenantId, (db) =>
    db
      .update(schema.garments)
      .set({
        analysis,
        title: analysis.title || "Untitled piece",
        category: analysis.category,
        colour: analysis.colour || null,
        status: analysis.usable ? "ready" : "unusable",
      })
      .where(and(eq(schema.garments.id, id), eq(schema.garments.tenantId, tenantId))),
  );
}

export async function setGarmentStatus(tenantId: string, id: string, status: string) {
  await scoped(tenantId, (db) => db.update(schema.garments).set({ status }).where(and(eq(schema.garments.id, id), eq(schema.garments.tenantId, tenantId))));
}

export async function renameGarment(tenantId: string, id: string, title: string) {
  await scoped(tenantId, (db) => db.update(schema.garments).set({ title }).where(and(eq(schema.garments.id, id), eq(schema.garments.tenantId, tenantId))));
}

export async function softDeleteGarment(tenantId: string, id: string) {
  await scoped(tenantId, (db) =>
    db
      .update(schema.garments)
      .set({ deletedAt: new Date(), status: "deleted" })
      .where(and(eq(schema.garments.id, id), eq(schema.garments.tenantId, tenantId))),
  );
}
