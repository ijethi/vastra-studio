"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { env } from "@/env";
import type { CreditPackId } from "@/lib/billing/packs";
import { getCreditPack } from "@/lib/dal/content";
import { settlePayment } from "@/lib/billing/settle";
import type { ActionResult } from "./garments";

export async function razorpayConfigured(): Promise<boolean> {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

/** Create a Razorpay order for a pack; the browser opens Razorpay Checkout with the returned id. */
export async function createRazorpayOrder(packId: CreditPackId): Promise<ActionResult<{ orderId: string; amountMinor: number; currency: string; keyId: string; paymentId: string }>> {
  const ctx = await requireRole(["owner", "admin"]);
  const pack = await getCreditPack(packId);
  if (!pack) return { ok: false, error: "Unknown pack." };
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return { ok: false, error: "Payments are not configured yet." };

  const db = await getDb();
  const paymentId = newId("pay");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: pack.amountMinor, currency: pack.currency, receipt: paymentId, notes: { tenantId: ctx.tenant.id, paymentId, packId } }),
  });
  if (!res.ok) return { ok: false, error: "Could not start the payment. Please try again." };
  const order = (await res.json()) as { id: string };

  await db.insert(schema.payments).values({
    id: paymentId,
    tenantId: ctx.tenant.id,
    provider: "razorpay",
    providerRef: order.id,
    amountMinor: pack.amountMinor,
    currency: pack.currency,
    credits: pack.credits,
    status: "created",
  });
  return { ok: true, data: { orderId: order.id, amountMinor: pack.amountMinor, currency: pack.currency, keyId: env.RAZORPAY_KEY_ID, paymentId } };
}

/**
 * Called from the browser after Checkout succeeds. Verifies Razorpay's
 * signature, then settles idempotently (the webhook may already have).
 */
export async function confirmRazorpayPayment(input: { paymentId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }): Promise<ActionResult<{ balance: number }>> {
  const ctx = await requireRole(["owner", "admin"]);
  if (!env.RAZORPAY_KEY_SECRET) return { ok: false, error: "Payments are not configured." };
  const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET).update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`).digest("hex");
  const a = Buffer.from(input.razorpaySignature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: "Payment could not be verified." };
  const balance = await settlePayment({ provider: "razorpay", providerRef: input.razorpayOrderId, tenantId: ctx.tenant.id, actorId: ctx.user.id });
  if (balance === null) return { ok: false, error: "Payment not found." };
  revalidatePath("/billing");
  return { ok: true, data: { balance } };
}
