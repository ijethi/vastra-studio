import Link from "next/link";
import { requireTenant } from "@/lib/auth/session";
import { getTenantSettings } from "@/lib/dal/tenants";
import { NavLinks, UserMenu } from "./nav";
import { Skeleton } from "@/components/ui/primitives";
import { Wordmark } from "./wordmark";

/** Authenticated frame: dark rail on desktop, light top bar and bottom tabs on phones. */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  const settings = await getTenantSettings(ctx.tenant.id);
  const credits = settings?.creditsBalance ?? 0;

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur lg:night lg:h-dvh lg:w-[264px] lg:flex-col lg:items-stretch lg:border-b-0 lg:border-r lg:border-night-line lg:px-5 lg:py-6">
        <Link href="/studio" className="flex items-center gap-2.5" aria-label="Vastra Studio home">
          <span className="lg:hidden">
            <Wordmark />
          </span>
          <span className="hidden lg:block">
            <Wordmark onDark />
          </span>
        </Link>
        <div className="hidden flex-1 lg:mt-10 lg:block">
          <NavLinks isPlatformAdmin={ctx.isPlatformAdmin} />
        </div>
        <div className="flex items-center gap-3 lg:flex-col lg:items-stretch lg:gap-3">
          <Link
            href="/billing"
            className="group flex items-center justify-between gap-3 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm lg:rounded-2xl lg:border-night-line lg:bg-white/5 lg:px-4 lg:py-3 lg:hover:bg-white/10"
          >
            <span className="text-ink-2 lg:text-night-ink-2">Credits</span>
            <span className="font-display text-lg font-bold tabular-nums text-ink lg:text-gold">{credits.toLocaleString("en-IN")}</span>
          </Link>
          <UserMenu name={ctx.user.name} email={ctx.user.email} tenantName={ctx.tenant.name} role={ctx.role} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/92 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur lg:hidden" aria-label="Primary">
          <NavLinks isPlatformAdmin={ctx.isPlatformAdmin} mobile />
        </nav>
      </div>
    </div>
  );
}

export function AppShellFallback({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex items-center justify-between border-b border-line px-4 py-3 lg:night lg:w-[264px] lg:flex-col lg:items-stretch lg:border-b-0 lg:px-5 lg:py-6">
        <span className="lg:hidden">
          <Wordmark />
        </span>
        <span className="hidden lg:block">
          <Wordmark onDark />
        </span>
        <div className="hidden lg:mt-10 lg:block lg:space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-11 rounded-2xl bg-white/5" />
          ))}
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 sm:px-6 lg:px-10 lg:pt-10">
        {children ?? (
          <>
            <Skeleton className="h-9 w-48" />
            <Skeleton className="mt-6 h-72" />
          </>
        )}
      </main>
    </div>
  );
}
