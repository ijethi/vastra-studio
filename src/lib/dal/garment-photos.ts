import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { GarmentPhotoKind } from "@/lib/db/schema";

export const MAX_EXTRA_PHOTOS = 5;

export async function listGarmentPhotos(tenantId: string, garmentId: string) {
  const db = await getDb();
  return db.query.garmentPhotos.findMany({
    where: and(eq(schema.garmentPhotos.tenantId, tenantId), eq(schema.garmentPhotos.garmentId, garmentId)),
    orderBy: asc(schema.garmentPhotos.createdAt),
  });
}

export async function addGarmentPhoto(values: typeof schema.garmentPhotos.$inferInsert) {
  const db = await getDb();
  const [row] = await db.insert(schema.garmentPhotos).values(values).returning();
  return row;
}

export async function getGarmentPhoto(tenantId: string, id: string) {
  const db = await getDb();
  return db.query.garmentPhotos.findFirst({ where: and(eq(schema.garmentPhotos.id, id), eq(schema.garmentPhotos.tenantId, tenantId)) });
}

export async function deleteGarmentPhoto(tenantId: string, id: string) {
  const db = await getDb();
  await db.delete(schema.garmentPhotos).where(and(eq(schema.garmentPhotos.id, id), eq(schema.garmentPhotos.tenantId, tenantId)));
}

export const PHOTO_KIND_LABEL: Record<GarmentPhotoKind, string> = { back: "Back", detail: "Detail", other: "Another angle" };
