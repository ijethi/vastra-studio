import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import { requireTenant } from "@/lib/auth/session";
import { listGarments } from "@/lib/dal/garments";
import { getStorage, READ_URL_TTL_SECONDS } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";

export const metadata = { title: "Gallery" };

async function Gallery() {
  const ctx = await requireTenant();
  const garments = await listGarments(ctx.tenant.id, 120);
  const storage = getStorage();

  if (garments.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        body="Upload your first garment photo and it will appear here with every image generated from it."
        action={
          <Button asChild>
            <Link href="/studio">Open the studio</Link>
          </Button>
        }
      />
    );
  }

  const cards = await Promise.all(
    garments.map(async (g) => {
      const hero = g.images[0];
      return {
        id: g.id,
        title: g.title,
        status: g.status,
        count: g.images.length,
        created: g.createdAt,
        heroUrl: hero ? await storage.signRead(hero.thumbKey, READ_URL_TTL_SECONDS) : await storage.signRead(g.thumbKey, READ_URL_TTL_SECONDS),
        isGenerated: Boolean(hero),
      };
    }),
  );

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {cards.map((c, i) => (
        <li key={c.id} className="fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <Link href={`/gallery/${c.id}`} className="group block">
            <div className="image-frame aspect-[3/4] transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:scale-[1.015]">
              <Image src={c.heroUrl} alt={c.title} width={480} height={640} unoptimized className="h-full w-full object-cover" />
              {!c.isGenerated ? <span className="absolute left-2 top-2 rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-ink-2">Garment photo</span> : null}
            </div>
            <div className="mt-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                <p className="text-xs text-ink-3">{c.count ? `${c.count} image${c.count === 1 ? "" : "s"}` : "No images yet"}</p>
              </div>
              {c.status === "unusable" ? <Badge tone="danger">Retake</Badge> : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function GalleryPage() {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Your pieces</p>
          <h1 className="display-lg">Gallery</h1>
        </div>
        <Button asChild>
          <Link href="/studio">
            <Plus className="h-4 w-4" aria-hidden="true" /> New garment
          </Link>
        </Button>
      </header>
      <Suspense
        fallback={
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="aspect-[3/4]" />
                <Skeleton className="mt-2.5 h-4 w-3/4" />
              </li>
            ))}
          </ul>
        }
      >
        <Gallery />
      </Suspense>
    </div>
  );
}
