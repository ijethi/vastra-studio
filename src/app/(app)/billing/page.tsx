import { Suspense } from "react";
import { requireTenant } from "@/lib/auth/session";
import { getTenantSettings, listLedger } from "@/lib/dal/tenants";
import { razorpayConfigured } from "@/app/actions/billing";
import { CREDIT_PACKS } from "@/lib/billing/packs";
import { BillingPanel } from "./billing-panel";
import { Card, Skeleton } from "@/components/ui/primitives";
import { isProd } from "@/env";

export const metadata = { title: "Billing" };

async function Billing() {
  const ctx = await requireTenant();
  const [settings, ledger, razorpay] = await Promise.all([getTenantSettings(ctx.tenant.id), listLedger(ctx.tenant.id, 40), razorpayConfigured()]);
  const canBuy = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <BillingPanel
        balance={settings?.creditsBalance ?? 0}
        plan={settings?.plan ?? "trial"}
        packs={CREDIT_PACKS.map((p) => ({ ...p }))}
        razorpay={razorpay}
        devTopUp={!isProd}
        canBuy={canBuy}
      />
      <Card className="p-6">
        <h2 className="text-xl">Activity</h2>
        <p className="mt-1 text-sm text-ink-2">Every credit movement, newest first.</p>
        {ledger.length === 0 ? (
          <p className="mt-6 text-sm text-ink-3">No activity yet.</p>
        ) : (
          <table className="mt-6 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="pb-2 font-medium">When</th>
                <th className="pb-2 font-medium">Reason</th>
                <th className="pb-2 text-right font-medium">Credits</th>
                <th className="pb-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ledger.map((l) => (
                <tr key={l.id}>
                  <td className="py-2.5 text-ink-2">{l.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-2.5 capitalize text-ink">
                    {l.reason}
                    {l.note ? <span className="block text-xs normal-case text-ink-3">{l.note}</span> : null}
                  </td>
                  <td className={`py-2.5 text-right tabular-nums ${l.delta < 0 ? "text-ink" : "text-success"}`}>{l.delta > 0 ? `+${l.delta}` : l.delta}</td>
                  <td className="py-2.5 text-right tabular-nums text-ink-2">{l.balanceAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export default function BillingPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-2">Credits</p>
        <h1 className="display-lg">Billing</h1>
      </header>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Billing />
      </Suspense>
    </div>
  );
}
