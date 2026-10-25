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
  return <CreditPackEditor rows={rows.map((p) => ({ id: p.id, label: p.label, blurb: p.blurb, credits: p.credits, amountMinor: p.amountMinor, currency: p.currency, active: p.active, sort: p.sort }))} />;
}

export default function CreditPacksPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-[var(--radius-card)]" />}>
      <CreditPacks />
    </Suspense>
  );
}
