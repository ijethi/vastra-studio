"use client";

import * as React from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { confirmRazorpayPayment, createRazorpayOrder } from "@/app/actions/billing";
import type { CreditPackId } from "@/lib/billing/packs";
import { grantDevCredits } from "@/app/actions/settings";
import type { AppContentMap } from "@/lib/content/types";

type Pack = { id: CreditPackId; credits: number; amountMinor: number; label: string; blurb: string };
type BillingCopy = AppContentMap["billing.copy"];

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function BillingPanel({ balance, plan, packs, copy, razorpay, devTopUp, canBuy }: { balance: number; plan: string; packs: Pack[]; copy: BillingCopy; razorpay: boolean; devTopUp: boolean; canBuy: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function buy(pack: Pack) {
    setBusy(pack.id);
    const order = await createRazorpayOrder(pack.id);
    if (!order.ok) {
      setBusy(null);
      return toast.push({ title: order.error, tone: "danger" });
    }
    if (!window.Razorpay) {
      setBusy(null);
      return toast.push({ title: "Payment window could not open. Please refresh and try again.", tone: "danger" });
    }
    const rz = new window.Razorpay({
      key: order.data.keyId,
      amount: order.data.amountMinor,
      currency: order.data.currency,
      name: "Vastra Studio",
      description: `${pack.credits} credits`,
      order_id: order.data.orderId,
      theme: { color: "#c2561e" },
      modal: { ondismiss: () => setBusy(null) },
      handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        const res = await confirmRazorpayPayment({
          paymentId: order.data.paymentId,
          razorpayOrderId: resp.razorpay_order_id,
          razorpayPaymentId: resp.razorpay_payment_id,
          razorpaySignature: resp.razorpay_signature,
        });
        setBusy(null);
        if (!res.ok) return toast.push({ title: res.error, tone: "danger" });
        toast.push({ title: `${pack.credits} credits added`, tone: "success" });
        router.refresh();
      },
    });
    rz.open();
  }

  return (
    <div className="space-y-6">
      {razorpay ? <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" /> : null}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Balance</p>
            <p className="mt-2 font-display text-5xl tabular-nums text-ink">{balance.toLocaleString("en-IN")}</p>
            <p className="mt-1 text-sm text-ink-2">{copy.balanceNote}</p>
          </div>
          <Badge tone={plan === "trial" ? "warning" : "success"} className="capitalize">
            {plan}
          </Badge>
        </div>
      </Card>

      <div>
        <h2 className="text-xl">{copy.packsHeading}</h2>
        <p className="mt-1 text-sm text-ink-2">{copy.packsNote}</p>
        {!razorpay ? (
          <div className="mt-4">
            <Alert tone="neutral" title="Payments are not switched on yet">
              Razorpay keys are needed before packs can be purchased. {devTopUp ? "In development you can add test credits below." : ""}
            </Alert>
          </div>
        ) : null}
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {packs.map((p, i) => (
            <li key={p.id} className="card flex flex-col p-5">
              <p className="text-sm font-medium text-ink-2">{p.label}</p>
              <p className="mt-2 font-display text-3xl text-ink">{p.credits.toLocaleString("en-IN")}</p>
              <p className="text-xs text-ink-3">credits · {p.blurb}</p>
              <p className="mt-4 text-lg font-medium text-ink">₹{(p.amountMinor / 100).toLocaleString("en-IN")}</p>
              <Button className="mt-4" variant={i === Math.min(1, packs.length - 1) ? "primary" : "secondary"} disabled={!razorpay || !canBuy || busy !== null} onClick={() => buy(p)}>
                {busy === p.id ? <Spinner /> : null} Buy
              </Button>
            </li>
          ))}
        </ul>
        {!canBuy ? <p className="mt-3 text-xs text-ink-3">Only owners and admins can buy credits.</p> : null}
      </div>

      {devTopUp && canBuy ? (
        <Card className="border-dashed p-5">
          <p className="text-sm font-medium text-ink">Development top-up</p>
          <p className="mt-1 text-xs text-ink-2">Adds credits without a payment gateway. Not available in production builds.</p>
          <div className="mt-3 flex gap-2">
            {[100, 500].map((n) => (
              <Button
                key={n}
                variant="secondary"
                size="sm"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(`dev-${n}`);
                  const res = await grantDevCredits(n);
                  setBusy(null);
                  if (!res.ok) return toast.push({ title: res.error, tone: "danger" });
                  toast.push({ title: `Added ${n} credits`, tone: "success" });
                  router.refresh();
                }}
              >
                +{n}
              </Button>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
