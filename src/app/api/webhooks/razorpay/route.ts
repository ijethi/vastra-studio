import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/env";
import { settlePayment } from "@/lib/billing/settle";

/** Razorpay webhook: verifies the HMAC signature and settles the payment idempotently. */
export async function POST(req: Request) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: "Bad signature" }, { status: 400 });

  const event = JSON.parse(raw) as { event: string; payload?: { payment?: { entity?: { order_id?: string } } } };
  if (event.event === "payment.captured" || event.event === "order.paid") {
    const orderId = event.payload?.payment?.entity?.order_id;
    if (orderId) await settlePayment({ provider: "razorpay", providerRef: orderId, actorId: null });
  }
  return NextResponse.json({ received: true });
}
