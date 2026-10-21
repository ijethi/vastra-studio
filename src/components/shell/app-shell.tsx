import Link from "next/link";
import { Suspense } from "react";
import { requireTenant } from "@/lib/auth/session";
import { getTenantSettings } from "@/lib/dal/tenants";
import { NavLinks, UserMenu } from "./nav";
import { Skeleton } from "@/components/ui/primitives";
import { Wordmark } from "./wordmark";

/** Authenticated frame: top bar on phones, left rail on desktop. */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  const settings = await getTenantSettings(ctx.tenant.id);
  const credits = settings?.creditsBalance ?? 0;

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur lg:h-dvh lg:w-64 lg:flex-col lg:items-stretch lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <Link href="/studio" className="flex items-center gap-2.5" aria-label="Vastra Studio home">
          <Wordmark />
        </Link>
        <div className="hidden flex-1 lg:mt-10 lg:block">
          <NavLinks isPlatformAdmin={ctx.isPlatformAdmin} />
        </div>
        <div className="flex items-center gap-3 lg:flex-col lg:items-stretch lg:gap-4">
          <Link href="/billing" className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm hover:border-line-strong">
            <span className="text-ink-2 group-hover:text-ink">Credits</span>
            <span className="font-display text-lg tabular-nums text-ink">{credits.toLocaleString("en-IN")}</span>
          </Link>
          <UserMenu name={ctx.user.name} email={ctx.user.email} tenantName={ctx.tenant.name} role={ctx.role} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/90 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur lg:hidden" aria-label="Primary">
          <NavLinks isPlatformAdmin={ctx.isPlatformAdmin} mobile />
        </nav>
      </div>
    </div>
  );
}

export function AppShellFallback({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex items-center justify-between border-b border-line px-4 py-3 lg:w-64 lg:flex-col lg:items-stretch lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
        <Wordmark />
        <div className="hidden lg:mt-10 lg:block lg:space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 sm:px-6 lg:px-10 lg:pt-10">
        {children ?? (
          <Suspense>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-6 h-72" />
          </Suspense>
        )}
      </main>
    </div>
  );
}
