import { Suspense } from "react";
import { connection } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { readCreditPackRows } from "@/lib/content/store";
import { Skeleton } from "@/components/ui/primitives";
import { CreditPackEditor } from "./editor";

async function CreditPacks() {
  // Request-time only: the admin console never belongs in a prerendered shell.
  await connection();
  await requirePlatformAdmin();
  const rows = await readCreditPackRows(await getDb());
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-2">
        {rows.filter((p) => p.active).length} active of {rows.length}. Prices are in whole rupees here and stored in paise; Razorpay orders use the stored amount at the moment of purchase, so editing a pack never changes a payment already made. The second pack is highlighted on the billing page.
      </p>
      <CreditPackEditor rows={rows.map((p) => ({ id: p.id, label: p.label, blurb: p.blurb, credits: p.credits, amountMinor: p.amountMinor, currency: p.currency, active: p.active, sort: p.sort }))} />
    </div>
  );
}

export default function CreditPacksPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <CreditPacks />
    </Suspense>
  );
}
