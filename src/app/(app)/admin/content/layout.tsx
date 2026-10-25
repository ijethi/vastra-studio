import Link from "next/link";

const TABS = [
  { href: "/admin/content", label: "Overview" },
  { href: "/admin/content/base-models", label: "Base models" },
  { href: "/admin/content/backdrops", label: "Backdrops" },
  { href: "/admin/content/credit-packs", label: "Credit packs" },
  { href: "/admin/content/reel-scenes", label: "Reel scenes" },
  { href: "/admin/content/copy", label: "App copy" },
];

export const metadata = { title: "Content" };

/**
 * Chrome only. Each page runs `requirePlatformAdmin()` inside its Suspense
 * boundary (like /admin), which also makes the page dynamic before any
 * database read, and every action checks again.
 */
export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow mb-2">
          <Link href="/admin" className="hover:underline">
            Platform
          </Link>{" "}
          · Content
        </p>
        <h1 className="display-lg">Editable content</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-2">
          Everything boutiques see that is not their own data: the model library, backdrops, credit packs, reel scenes and the landing copy. Changes apply within a minute on every server and are recorded in the audit log.
        </p>
      </header>
      <nav aria-label="Content sections" className="flex flex-wrap gap-2 border-b border-line pb-3">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="rounded-full border border-line px-3 py-1.5 text-sm text-ink hover:bg-surface-2">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
