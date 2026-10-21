import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Clapperboard, Sparkles } from "lucide-react";
import { requireTenant } from "@/lib/auth/session";
import { getGarment } from "@/lib/dal/garments";
import { listJobsForGarment } from "@/lib/dal/jobs";
import { listReelsForGarment } from "@/lib/dal/reels";
import { vibeInfo } from "@/lib/reels/scenes";
import { getStorage, READ_URL_TTL_SECONDS } from "@/lib/storage";
import { getBackdrop, getBaseModel } from "@/lib/base-models/catalog";
import { Button } from "@/components/ui/button";
import { Badge, Card, Skeleton } from "@/components/ui/primitives";
import { GarmentActions, ImageCard } from "./garment-actions";
import { ShareLinkButton } from "@/components/share/share-dialog";

async function Detail({ params }: { params: Promise<{ garmentId: string }> }) {
  const { garmentId } = await params;
  const ctx = await requireTenant();
  const garment = await getGarment(ctx.tenant.id, garmentId);
  if (!garment) notFound();
  const [jobs, reelRows] = await Promise.all([listJobsForGarment(ctx.tenant.id, garmentId), listReelsForGarment(ctx.tenant.id, garmentId)]);
  const storage = getStorage();
  const originalUrl = await storage.signRead(garment.originalKey, READ_URL_TTL_SECONDS);

  const runs = await Promise.all(
    jobs.map(async (j) => ({
      id: j.id,
      status: j.status,
      statusMessage: j.statusMessage,
      createdAt: j.createdAt,
      model: getBaseModel(j.baseModelId)?.label ?? j.baseModelId,
      backdrop: getBackdrop(j.backdrop)?.label ?? j.backdrop,
      credits: j.creditsCharged - j.creditsRefunded,
      images: await Promise.all(
        j.images.map(async (img) => ({
          id: img.id,
          url: await storage.signRead(img.storageKey, READ_URL_TTL_SECONDS),
          width: img.width,
          height: img.height,
          qualityScore: img.qualityScore,
          accepted: img.accepted,
          provider: img.provider,
        })),
      ),
    })),
  );

  const canDelete = ctx.role === "owner" || ctx.role === "admin";

  // The reel starts from the best image: a kept one first, else the newest.
  const allImages = runs.flatMap((r) => r.images);
  const heroImage = allImages.find((i) => i.accepted) ?? allImages[0] ?? null;
  const reels = await Promise.all(
    reelRows.map(async (r) => {
      const firstStill = r.assets.find((a) => a.kind === "still");
      const coverKey = r.coverKey ?? firstStill?.thumbKey ?? null;
      return {
        id: r.id,
        vibe: vibeInfo(r.vibe).label,
        status: r.status,
        createdAt: r.createdAt,
        credits: r.creditsCharged - r.creditsRefunded,
        durationSec: r.durationSec,
        coverUrl: coverKey ? await storage.signRead(coverKey, READ_URL_TTL_SECONDS) : null,
      };
    }),
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/gallery" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Gallery
          </Link>
          <h1 className="display-lg truncate">{garment.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-2">
            <span className="rounded-full bg-surface-2 px-2.5 py-1 capitalize">{garment.category.replace("-", " ")}</span>
            {garment.colour ? <span className="rounded-full bg-surface-2 px-2.5 py-1">{garment.colour}</span> : null}
            <span className="rounded-full bg-surface-2 px-2.5 py-1">Added {garment.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/studio?garment=${garment.id}`}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Generate
            </Link>
          </Button>
          {heroImage ? (
            <Button asChild variant="night">
              <Link href={`/reels/new?image=${heroImage.id}`}>
                <Clapperboard className="h-4 w-4" aria-hidden="true" /> Make a reel
              </Link>
            </Button>
          ) : null}
          {runs.some((r) => r.images.length) ? <ShareLinkButton targetType="garment" targetId={garment.id} title={garment.title} size="md" /> : null}
          <GarmentActions garmentId={garment.id} title={garment.title} canDelete={canDelete} />
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside>
          <p className="eyebrow mb-3">Garment photo</p>
          <div className="image-frame aspect-[3/4]">
            <Image src={originalUrl} alt={`${garment.title} garment photo`} width={garment.width} height={garment.height} unoptimized className="h-full w-full object-cover" />
          </div>
        </aside>

        <section className="space-y-8">
          {runs.length === 0 ? (
            <Card className="p-8 text-center">
              <h2 className="text-xl">No runs yet</h2>
              <p className="mt-2 text-sm text-ink-2">Generate the first on-model images for this piece.</p>
            </Card>
          ) : (
            runs.map((run) => (
              <div key={run.id}>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-ink">{run.model}</span>
                  <span className="text-ink-3">·</span>
                  <span className="text-ink-2">{run.backdrop}</span>
                  <span className="text-ink-3">·</span>
                  <span className="text-ink-2">{run.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <RunBadge status={run.status} />
                  <span className="ml-auto text-xs text-ink-3">{run.credits} credits</span>
                </div>
                {run.images.length ? (
                  <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
                    {run.images.map((img, i) => (
                      <li key={img.id}>
                        <ImageCard image={img} alt={`${garment.title} on model, variation ${i + 1}`} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-2">{run.statusMessage ?? "Working"}</p>
                )}
              </div>
            ))
          )}

          {reels.length ? (
            <div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-xl">Reels</h2>
                {heroImage ? (
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/reels/new?image=${heroImage.id}`}>
                      <Clapperboard className="h-4 w-4" aria-hidden="true" /> New reel
                    </Link>
                  </Button>
                ) : null}
              </div>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {reels.map((r) => (
                  <li key={r.id}>
                    <Link href={`/reels/${r.id}`} className="group block">
                      <div className="image-frame aspect-[9/16] bg-night">
                        {r.coverUrl ? (
                          <Image src={r.coverUrl} alt={`${r.vibe} reel of ${garment.title}`} width={360} height={640} unoptimized className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:scale-[1.03]" />
                        ) : (
                          <div className="shimmer h-full w-full" />
                        )}
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-ink">
                          <Clapperboard className="h-3 w-3" aria-hidden="true" /> {r.vibe}
                        </span>
                        {r.durationSec ? <span className="absolute bottom-2 right-2 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-medium text-white">{r.durationSec} s</span> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
                        <ReelBadge status={r.status} />
                        <span>{r.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                        <span className="ml-auto text-ink-3">{r.credits} credits</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ReelBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge tone="success">Ready</Badge>;
  if (status === "partially_completed") return <Badge tone="warning">Ready · partial</Badge>;
  if (status === "selecting") return <Badge tone="accent">Pick scenes</Badge>;
  if (status === "failed") return <Badge tone="danger">Failed</Badge>;
  return <Badge tone="neutral">In progress</Badge>;
}

function RunBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge tone="success">Complete</Badge>;
  if (status === "partially_completed") return <Badge tone="warning">Partial</Badge>;
  if (status === "failed") return <Badge tone="danger">Failed · refunded</Badge>;
  return <Badge tone="neutral">In progress</Badge>;
}

export const metadata = { title: "Garment" };

export default function GarmentPage({ params }: { params: Promise<{ garmentId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-9 w-72" />
          <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
            <Skeleton className="aspect-[3/4]" />
            <Skeleton className="h-72" />
          </div>
        </div>
      }
    >
      <Detail params={params} />
    </Suspense>
  );
}
