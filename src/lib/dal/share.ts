import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { env } from "@/env";

export type ShareTarget = "image" | "garment" | "reel";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Create a public, expiring link. Only the hash is stored; the token is returned once. */
export async function createShareLink(args: { tenantId: string; targetType: ShareTarget; targetId: string; createdBy: string; days?: number }) {
  const db = await getDb();
  const token = randomBytes(24).toString("base64url");
  const id = newId("shr");
  const expiresAt = new Date(Date.now() + (args.days ?? 30) * 24 * 60 * 60 * 1000);
  await db.insert(schema.shareLinks).values({
    id,
    tenantId: args.tenantId,
    targetType: args.targetType,
    targetId: args.targetId,
    tokenHash: hash(token),
    expiresAt,
    createdBy: args.createdBy,
  });
  return { id, url: `${env.APP_URL}/s/${token}`, expiresAt };
}

export async function revokeShareLink(tenantId: string, id: string) {
  const db = await getDb();
  await db
    .update(schema.shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.shareLinks.id, id), eq(schema.shareLinks.tenantId, tenantId)));
}

export async function listShareLinks(tenantId: string, targetId: string) {
  const db = await getDb();
  return db.query.shareLinks.findMany({
    where: and(eq(schema.shareLinks.tenantId, tenantId), eq(schema.shareLinks.targetId, targetId), isNull(schema.shareLinks.revokedAt)),
    orderBy: desc(schema.shareLinks.createdAt),
  });
}

/** Resolve a public token. Returns null when unknown, expired or revoked. */
export async function resolveShareToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const db = await getDb();
  const link = await db.query.shareLinks.findFirst({ where: eq(schema.shareLinks.tokenHash, hash(token)) });
  if (!link || link.revokedAt || link.expiresAt < new Date()) return null;
  return link;
}

/** Boutique contact details live in the organization's metadata JSON (no schema change). */
export type BoutiqueContact = { whatsapp?: string; instagram?: string; city?: string };

export async function getBoutiqueContact(tenantId: string): Promise<BoutiqueContact> {
  const db = await getDb();
  const org = await db.query.organization.findFirst({ where: eq(schema.organization.id, tenantId) });
  if (!org?.metadata) return {};
  try {
    const parsed = JSON.parse(org.metadata) as Record<string, unknown>;
    return {
      whatsapp: typeof parsed.whatsapp === "string" ? parsed.whatsapp : undefined,
      instagram: typeof parsed.instagram === "string" ? parsed.instagram : undefined,
      city: typeof parsed.city === "string" ? parsed.city : undefined,
    };
  } catch {
    return {};
  }
}

export async function setBoutiqueContact(tenantId: string, contact: BoutiqueContact) {
  const db = await getDb();
  const existing = await getBoutiqueContact(tenantId);
  await db
    .update(schema.organization)
    .set({ metadata: JSON.stringify({ ...existing, ...contact }) })
    .where(eq(schema.organization.id, tenantId));
}
