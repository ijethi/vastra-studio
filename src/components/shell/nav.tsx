"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, Images, CreditCard, Settings2, ShieldCheck, LogOut, ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { cn } from "@/lib/cn";
import { authClient } from "@/lib/auth/client";

const items = [
  { href: "/studio", label: "Studio", icon: Sparkles },
  { href: "/gallery", label: "Gallery", icon: Images },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function NavLinks({ isPlatformAdmin, mobile }: { isPlatformAdmin: boolean; mobile?: boolean }) {
  const pathname = usePathname();
  const all = isPlatformAdmin ? [...items, { href: "/admin", label: "Admin", icon: ShieldCheck }] : items;
  return (
    <ul className={cn("flex", mobile ? "justify-around" : "flex-col gap-1")}>
      {all.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <li key={href} className={mobile ? "flex-1" : undefined}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-2xl text-sm font-semibold transition-colors",
                mobile
                  ? cn("flex-col gap-1 px-2 py-1.5 text-[11px]", active ? "text-accent" : "text-ink-2")
                  : cn("px-3.5 py-3", active ? "bg-white/10 text-night-ink" : "text-night-ink-2 hover:bg-white/5 hover:text-night-ink"),
              )}
            >
              <Icon className={cn("h-[20px] w-[20px]", active ? "text-accent" : "")} aria-hidden="true" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function UserMenu({ name, email, tenantName, role }: { name: string; email: string; tenantName: string; role: string }) {
  const router = useRouter();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-3 rounded-2xl px-1.5 py-1.5 text-left lg:w-full lg:px-3 lg:hover:bg-white/5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent font-display text-sm font-bold text-on-accent" aria-hidden="true">
          {tenantName.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden min-w-0 flex-1 lg:block">
          <span className="block truncate text-sm font-semibold text-night-ink">{tenantName}</span>
          <span className="block truncate text-xs text-night-ink-2">
            {name} · {role === "member" ? "staff" : role}
          </span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-night-ink-2 lg:block" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lg)] fade-up">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-ink-2">{email}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild>
            <Link href="/settings" className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink outline-none hover:bg-surface-2 focus:bg-surface-2">
              <Settings2 className="h-4 w-4" aria-hidden="true" /> Boutique settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink outline-none hover:bg-surface-2 focus:bg-surface-2"
            onSelect={async () => {
              await authClient.signOut();
              router.push("/sign-in");
              router.refresh();
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
