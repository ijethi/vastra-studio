import Link from "next/link";
import { ContentTabs } from "./content-tabs";

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
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-2">
          <Link href="/admin" className="transition-colors hover:text-ink">
            Platform
          </Link>
          <span aria-hidden="true" className="mx-2 opacity-50">
            /
          </span>
          Content
        </p>
        <h1 className="display-lg">Editable content</h1>
        <p className="mt-3 max-w-2xl text-[0.95rem] leading-7 text-ink-2">
          Everything boutiques see that is not their own data: the model library, backdrops, credit packs, reel scenes and the landing copy. Changes apply within a minute on every server and are recorded in the audit log.
        </p>
      </header>
      <ContentTabs tabs={TABS} />
      {children}
    </div>
  );
}
