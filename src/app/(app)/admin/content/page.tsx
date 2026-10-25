import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { readAppContentRows, readBackdropRows, readBaseModelRows, readCreditPackRows, readReelSceneRows } from "@/lib/content/store";
import { Card, Skeleton } from "@/components/ui/primitives";
import { RestoreDefaults } from "./restore-defaults";

async function Overview() {
  // Request-time only: the admin console never belongs in a prerendered shell.
  await connection();
  await requirePlatformAdmin();
  const db = await getDb();
  const [models, backdrops, packs, scenes, copy] = await Promise.all([readBaseModelRows(db), readBackdropRows(db), readCreditPackRows(db), readReelSceneRows(db), readAppContentRows(db)]);
  const rows = [
    { href: "/admin/content/base-models", label: "Base models", total: models.length, active: models.filter((m) => m.active).length, extra: `${models.filter((m) => m.imageKey || m.imageUrl).length} with an uploaded preview` },
    { href: "/admin/content/backdrops", label: "Backdrops", total: backdrops.length, active: backdrops.filter((b) => b.active).length },
    { href: "/admin/content/credit-packs", label: "Credit packs", total: packs.length, active: packs.filter((p) => p.active).length },
    { href: "/admin/content/reel-scenes", label: "Reel scenes", total: scenes.length, active: scenes.filter((s) => s.active).length, extra: "9 active per vibe is the full grid" },
    { href: "/admin/content/copy", label: "App copy", total: copy.length, active: copy.length, extra: copy.length ? `last edited ${copy.map((c) => c.updatedAt).sort((a, b) => b.getTime() - a.getTime())[0].toLocaleString("en-IN")}` : undefined },
  ];
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Card key={r.href} className="p-4">
            <Link href={r.href} className="text-sm font-medium text-ink hover:underline">
              {r.label}
            </Link>
            <p className="mt-1 font-display text-2xl tabular-nums text-ink">
              {r.active} <span className="text-base text-ink-3">active of {r.total}</span>
            </p>
            {r.extra ? <p className="mt-1 text-xs text-ink-3">{r.extra}</p> : null}
          </Card>
        ))}
      </section>
      <RestoreDefaults />
    </>
  );
}

export default function ContentOverviewPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <Overview />
    </Suspense>
  );
}
