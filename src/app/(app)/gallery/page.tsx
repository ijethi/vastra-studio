import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import { requireTenant } from "@/lib/auth/session";
import { listGarments } from "@/lib/dal/garments";
import { getStorage, READ_URL_TTL_SECONDS } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Skeleton, Spinner } from "@/components/ui/primitives";
import { LiveRefresh } from "@/components/gallery/live-refresh";

export const metadata = { title: "Gallery" };

const IN_PROGRESS = new Set(["queued", "analysing", "generating", "finishing", "gating"]);

async function Gallery() {
  const ctx = await requireTenant();
  const garments = await listGarments(ctx.tenant.id, 120);
  const storage = getStorage();

  if (garments.length === 0) {
    return (
      <EmptyState
        title="No photos yet"
        body="Add your first garment photo and it will appear here with every version we make from it."
        action={
          <Button asChild>
            <Link href="/studio">Add a photo</Link>
          </Button>
        }
      />
    );
  }

  const cards = await Promise.all(
    garments.map(async (g) => {
      const hero = g.images[0];
      const latestJob = g.jobs[0];
      return {
        id: g.id,
        title: g.title,
        status: g.status,
        count: g.images.length,
        working: Boolean(latestJob && IN_PROGRESS.has(latestJob.status)),
        heroUrl: hero ? await storage.signRead(hero.thumbKey, READ_URL_TTL_SECONDS) : await storage.signRead(g.thumbKey, READ_URL_TTL_SECONDS),
        isGenerated: Boolean(hero),
      };
    }),
  );
  const anyWorking = cards.some((c) => c.working);

  return (
    <>
      <LiveRefresh active={anyWorking} />
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c, i) => (
          <li key={c.id} className="fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <Link href={`/gallery/${c.id}`} className="group block">
              <div className="image-frame aspect-[3/4] transition-transform duration-300 ease-[var(--ease-out-soft)] group-hover:scale-[1.015]">
                <Image src={c.heroUrl} alt={c.title} width={480} height={640} unoptimized className={c.working && !c.isGenerated ? "h-full w-full object-cover opacity-60" : "h-full w-full object-cover"} />
                {c.working ? (
                  <span className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-surface/95 px-2 py-1 text-[11px] font-medium text-ink">
                    <Spinner className="h-3 w-3" /> Making the photo
                  </span>
                ) : !c.isGenerated ? (
                  <span className="absolute left-2 top-2 rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-ink-2">Garment photo</span>
                ) : null}
              </div>
              <div className="mt-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                  <p className="text-xs text-ink-3">{c.count ? `${c.count} image${c.count === 1 ? "" : "s"}` : c.working ? "In progress" : "No images yet"}</p>
                </div>
                {c.status === "unusable" ? <Badge tone="danger">Retake</Badge> : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
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
            <Plus className="h-4 w-4" aria-hidden="true" /> Add a photo
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
