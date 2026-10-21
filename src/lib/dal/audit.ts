import "server-only";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/ids";

export async function audit(entry: {
  tenantId: string | null;
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.insert(schema.auditLog).values({
    id: newId("aud"),
    tenantId: entry.tenantId,
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? null,
    ip: entry.ip ?? null,
  });
}
