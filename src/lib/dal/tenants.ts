import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { env } from "@/env";
import { newId } from "@/lib/ids";
import { DEFAULT_BACKDROP_ID, DEFAULT_BASE_MODEL_ID } from "@/lib/base-models/catalog";

export class InsufficientCreditsError extends Error {
  constructor(public needed: number, public balance: number) {
    super(`Insufficient credits: need ${needed}, have ${balance}`);
  }
}

export class SpendCapError extends Error {
  constructor() {
    super("Daily spend cap reached for this boutique");
  }
}

/** Create the settings row (and trial credits) the first time a tenant is seen. */
export async function ensureTenantSettings(tenantId: string, actorId: string | null) {
  const db = await getDb();
  const existing = await db.query.tenantSettings.findFirst({ where: eq(schema.tenantSettings.tenantId, tenantId) });
  if (existing) return existing;
  const [row] = await db
    .insert(schema.tenantSettings)
    .values({
      tenantId,
      defaultBaseModelId: DEFAULT_BASE_MODEL_ID,
      defaultBackdrop: DEFAULT_BACKDROP_ID,
      creditsBalance: env.TRIAL_CREDITS,
      watermarkEnabled: true,
    })
    .onConflictDoNothing()
    .returning();
  if (row && env.TRIAL_CREDITS > 0) {
    await db.insert(schema.creditLedger).values({
      id: newId("led"),
      tenantId,
      delta: env.TRIAL_CREDITS,
      reason: "trial",
      balanceAfter: env.TRIAL_CREDITS,
      note: "Welcome credits",
      createdBy: actorId,
    });
  }
  return row ?? (await db.query.tenantSettings.findFirst({ where: eq(schema.tenantSettings.tenantId, tenantId) }))!;
}

export async function getTenantSettings(tenantId: string) {
  const db = await getDb();
  return db.query.tenantSettings.findFirst({ where: eq(schema.tenantSettings.tenantId, tenantId) });
}

export async function updateTenantSettings(
  tenantId: string,
  patch: Partial<Pick<typeof schema.tenantSettings.$inferInsert, "defaultBaseModelId" | "defaultBackdrop" | "defaultVariations" | "watermarkEnabled" | "autoGenerate" | "country">>,
) {
  const db = await getDb();
  await db.update(schema.tenantSettings).set({ ...patch, updatedAt: new Date() }).where(eq(schema.tenantSettings.tenantId, tenantId));
}

/** Credits spent today (UTC) by this tenant, for the daily cap. */
export async function creditsSpentToday(tenantId: string): Promise<number> {
  const db = await getDb();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ spent: sql<number>`coalesce(sum(case when ${schema.creditLedger.delta} < 0 then -${schema.creditLedger.delta} else 0 end), 0)` })
    .from(schema.creditLedger)
    .where(and(eq(schema.creditLedger.tenantId, tenantId), gte(schema.creditLedger.createdAt, start)));
  return Number(row?.spent ?? 0);
}

/**
 * Atomically deduct credits. The conditional UPDATE guarantees the balance
 * never goes negative even under concurrent requests.
 */
export async function chargeCredits(args: { tenantId: string; amount: number; jobId: string; actorId: string }) {
  const db = await getDb();
  const settings = await getTenantSettings(args.tenantId);
  if (!settings) throw new Error("Tenant not initialised");
  const spent = await creditsSpentToday(args.tenantId);
  if (spent + args.amount > settings.dailySpendCapCredits) throw new SpendCapError();

  const updated = await db
    .update(schema.tenantSettings)
    .set({ creditsBalance: sql`${schema.tenantSettings.creditsBalance} - ${args.amount}`, updatedAt: new Date() })
    .where(and(eq(schema.tenantSettings.tenantId, args.tenantId), gte(schema.tenantSettings.creditsBalance, args.amount)))
    .returning({ balance: schema.tenantSettings.creditsBalance });
  if (updated.length === 0) throw new InsufficientCreditsError(args.amount, settings.creditsBalance);

  await db.insert(schema.creditLedger).values({
    id: newId("led"),
    tenantId: args.tenantId,
    delta: -args.amount,
    reason: "generation",
    jobId: args.jobId,
    balanceAfter: updated[0].balance,
    createdBy: args.actorId,
  });
  return updated[0].balance;
}

export async function creditTenant(args: {
  tenantId: string;
  amount: number;
  reason: "refund" | "purchase" | "adjustment" | "trial";
  jobId?: string;
  paymentId?: string;
  note?: string;
  actorId: string | null;
}) {
  const db = await getDb();
  const [row] = await db
    .update(schema.tenantSettings)
    .set({ creditsBalance: sql`${schema.tenantSettings.creditsBalance} + ${args.amount}`, updatedAt: new Date() })
    .where(eq(schema.tenantSettings.tenantId, args.tenantId))
    .returning({ balance: schema.tenantSettings.creditsBalance });
  await db.insert(schema.creditLedger).values({
    id: newId("led"),
    tenantId: args.tenantId,
    delta: args.amount,
    reason: args.reason,
    jobId: args.jobId ?? null,
    paymentId: args.paymentId ?? null,
    balanceAfter: row?.balance ?? 0,
    note: args.note ?? null,
    createdBy: args.actorId,
  });
  return row?.balance ?? 0;
}

export async function listLedger(tenantId: string, limit = 50) {
  const db = await getDb();
  return db.query.creditLedger.findMany({
    where: eq(schema.creditLedger.tenantId, tenantId),
    orderBy: desc(schema.creditLedger.createdAt),
    limit,
  });
}

export { creditsForRun } from "./pricing";
