import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export async function getPlatformSetting<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.query.platformSettings.findFirst({ where: eq(schema.platformSettings.key, key) });
  return (row?.value as T | undefined) ?? null;
}

export async function setPlatformSetting(key: string, value: unknown, updatedBy: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(schema.platformSettings)
    .values({ key, value, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value, updatedBy, updatedAt: new Date() } });
}
