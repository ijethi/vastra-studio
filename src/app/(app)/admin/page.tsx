import { Suspense } from "react";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { listRecentJobsAllTenants } from "@/lib/dal/jobs";
import { getPlatformSetting } from "@/lib/dal/platform";
import { tryOnProviderOrder } from "@/env";
import type { ProviderSwitches } from "@/lib/providers/tryon";
import { ProviderSwitchesPanel } from "./provider-switches";
import { Badge, Card, Skeleton } from "@/components/ui/primitives";

export const metadata = { title: "Admin" };

async function Admin() {
  await requirePlatformAdmin();
  const db = await getDb();
  const [tenants, jobs, switches, stats] = await Promise.all([
    db
      .select({
        id: schema.organization.id,
        name: schema.organization.name,
        createdAt: schema.organization.createdAt,
        plan: schema.tenantSettings.plan,
        credits: schema.tenantSettings.creditsBalance,
      })
      .from(schema.organization)
      .leftJoin(schema.tenantSettings, eq(schema.tenantSettings.tenantId, schema.organization.id))
      .orderBy(desc(schema.organization.createdAt))
      .limit(100),
    listRecentJobsAllTenants(40),
    getPlatformSetting<ProviderSwitches>("tryon.switches"),
    db
      .select({
        total: sql<number>`count(*)`,
        completed: sql<number>`sum(case when ${schema.generationJobs.status} in ('completed','partially_completed') then 1 else 0 end)`,
        failed: sql<number>`sum(case when ${schema.generationJobs.status} = 'failed' then 1 else 0 end)`,
        images: sql<number>`(select count(*) from ${schema.generatedImages})`,
        accepted: sql<number>`(select count(*) from ${schema.generatedImages} where ${schema.generatedImages.accepted} = true)`,
      })
      .from(schema.generationJobs),
  ]);
  const s = stats[0];

  return (
    <div className="space-y-10">
      <section className="grid gap-3 sm:grid-cols-5">
        {[
          ["Boutiques", tenants.length],
          ["Runs", Number(s?.total ?? 0)],
          ["Completed", Number(s?.completed ?? 0)],
          ["Failed", Number(s?.failed ?? 0)],
          ["Images kept", `${Number(s?.accepted ?? 0)} / ${Number(s?.images ?? 0)}`],
        ].map(([label, value]) => (
          <Card key={label as string} className="p-4">
            <p className="text-xs uppercase tracking-wide text-ink-3">{label}</p>
            <p className="mt-1 font-display text-2xl tabular-nums text-ink">{value}</p>
          </Card>
        ))}
      </section>

      <ProviderSwitchesPanel providers={tryOnProviderOrder} switches={switches ?? {}} />

      <Card className="p-6">
        <h2 className="text-xl">Editable content</h2>
        <p className="mt-1 text-sm text-ink-2">The model library, backdrops, credit packs, reel scenes and the landing copy live in the database and are edited here. Every change is audited.</p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {[
            ["/admin/content/base-models", "Base models"],
            ["/admin/content/backdrops", "Backdrops"],
            ["/admin/content/credit-packs", "Credit packs"],
            ["/admin/content/reel-scenes", "Reel scenes"],
            ["/admin/content/copy", "App copy"],
          ].map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="rounded-full border border-line px-3 py-1.5 text-sm text-ink hover:bg-surface-2">
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <section>
        <h2 className="text-xl">Boutiques</h2>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Plan</th>
                <th className="px-4 py-2.5 text-right font-medium">Credits</th>
                <th className="px-4 py-2.5 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2.5 text-ink">{t.name}</td>
                  <td className="px-4 py-2.5 capitalize text-ink-2">{t.plan ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{t.credits ?? 0}</td>
                  <td className="px-4 py-2.5 text-ink-2">{t.createdAt.toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl">Recent runs</h2>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Garment</th>
                <th className="px-4 py-2.5 font-medium">Provider</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Credits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="px-4 py-2.5 text-ink-2">{j.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-4 py-2.5 text-ink">{j.garment.title}</td>
                  <td className="px-4 py-2.5 text-ink-2">{j.provider ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={j.status === "completed" ? "success" : j.status === "failed" ? "danger" : j.status === "partially_completed" ? "warning" : "neutral"}>{j.status.replace("_", " ")}</Badge>
                    {j.error ? <span className="block max-w-xs truncate text-xs text-ink-3">{j.error}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{j.creditsCharged - j.creditsRefunded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function AdminPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-2">Platform</p>
        <h1 className="display-lg">Admin console</h1>
      </header>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Admin />
      </Suspense>
    </div>
  );
}
