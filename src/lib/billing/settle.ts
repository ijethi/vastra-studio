import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { creditTenant } from "@/lib/dal/tenants";
import { audit } from "@/lib/dal/audit";

/**
 * Marks a payment paid and credits the ledger exactly once. Shared by the
 * browser confirmation action and the gateway webhook, so whichever arrives
 * first wins and the other is a no-op. Returns the new balance, or null when
 * the payment is unknown or belongs to a different tenant.
 */
export async function settlePayment(args: { provider: string; providerRef: string; tenantId?: string; actorId: string | null }): Promise<number | null> {
  const db = await getDb();
  const payment = await db.query.payments.findFirst({ where: eq(schema.payments.providerRef, args.providerRef) });
  if (!payment || payment.provider !== args.provider) return null;
  if (args.tenantId && payment.tenantId !== args.tenantId) return null;
  if (payment.status === "paid") {
    const settings = await db.query.tenantSettings.findFirst({ where: eq(schema.tenantSettings.tenantId, payment.tenantId) });
    return settings?.creditsBalance ?? 0;
  }
  // Conditional update: only the first caller flips created -> paid.
  const updated = await db
    .update(schema.payments)
    .set({ status: "paid", paidAt: new Date() })
    .where(eq(schema.payments.id, payment.id))
    .returning();
  if (updated.length === 0) return null;
  const balance = await creditTenant({
    tenantId: payment.tenantId,
    amount: payment.credits,
    reason: "purchase",
    paymentId: payment.id,
    note: `${payment.credits} credits`,
    actorId: args.actorId,
  });
  await audit({
    tenantId: payment.tenantId,
    actorId: args.actorId,
    action: "payment.settled",
    targetType: "payment",
    targetId: payment.id,
    metadata: { credits: payment.credits, amountMinor: payment.amountMinor },
  });
  return balance;
}
