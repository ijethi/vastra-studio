"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type ContentTab = { href: string; label: string };

/** Pill tabs for the content sections; the current one is the night pill. Scrolls sideways on a phone. */
export function ContentTabs({ tabs }: { tabs: ContentTab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Content sections" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
        {tabs.map((t) => {
          const active = t.href === "/admin/content" ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors",
                  active ? "bg-ink text-canvas" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
