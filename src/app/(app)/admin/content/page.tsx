import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { ArrowUpRight } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { readAppContentRows, readBackdropRows, readBaseModelRows, readCreditPackRows, readReelSceneRows } from "@/lib/content/store";
import { Skeleton } from "@/components/ui/primitives";
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
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="card group flex flex-col p-5 transition-[transform,box-shadow] duration-200 ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">{r.label}</p>
              <ArrowUpRight className="h-4 w-4 text-ink-3 transition-colors group-hover:text-accent" aria-hidden="true" />
            </div>
            <p className="mt-5 font-display text-3xl font-bold tabular-nums text-ink">
              {r.active}
              <span className="ml-2 text-sm font-medium text-ink-3">{r.href.endsWith("/copy") ? `of ${r.total} keys saved` : `live of ${r.total}`}</span>
            </p>
            <p className="mt-1 min-h-5 text-xs text-ink-3">{r.extra ?? ""}</p>
          </Link>
        ))}
        <RestoreDefaults />
      </section>
    </>
  );
}

export default function ContentOverviewPage() {
  return (
    <Suspense
      fallback={
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-36 rounded-[var(--radius-card)]" />
          ))}
        </div>
      }
    >
      <Overview />
    </Suspense>
  );
}
