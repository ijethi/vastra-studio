import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import type { GarmentPhotoKind } from "@/lib/db/schema";
import { scoped } from "./scope";

export const MAX_EXTRA_PHOTOS = 5;

export async function listGarmentPhotos(tenantId: string, garmentId: string) {
  return scoped(tenantId, (db) =>
    db.query.garmentPhotos.findMany({
      where: and(eq(schema.garmentPhotos.tenantId, tenantId), eq(schema.garmentPhotos.garmentId, garmentId)),
      orderBy: asc(schema.garmentPhotos.createdAt),
    }),
  );
}

export async function addGarmentPhoto(values: typeof schema.garmentPhotos.$inferInsert) {
  return scoped(values.tenantId, async (db) => {
    const [row] = await db.insert(schema.garmentPhotos).values(values).returning();
    return row;
  });
}

export async function getGarmentPhoto(tenantId: string, id: string) {
  return scoped(tenantId, (db) => db.query.garmentPhotos.findFirst({ where: and(eq(schema.garmentPhotos.id, id), eq(schema.garmentPhotos.tenantId, tenantId)) }));
}

export async function deleteGarmentPhoto(tenantId: string, id: string) {
  await scoped(tenantId, (db) => db.delete(schema.garmentPhotos).where(and(eq(schema.garmentPhotos.id, id), eq(schema.garmentPhotos.tenantId, tenantId))));
}

export const PHOTO_KIND_LABEL: Record<GarmentPhotoKind, string> = { back: "Back", detail: "Detail", other: "Another angle" };
