import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/auth/session";
import { getReel } from "@/lib/dal/reels";
import { getTenantSettings } from "@/lib/dal/tenants";
import { getStorage, READ_URL_TTL_SECONDS } from "@/lib/storage";
import { ReelFlow } from "@/components/reels/reel-flow";
import { ReelSkeleton } from "@/components/reels/reel-skeleton";

export const metadata = { title: "Reel" };

/** Resume or review a reel: the flow picks up from whatever stage the worker left it at. */
async function Reel({ params }: { params: Promise<{ reelId: string }> }) {
  const { reelId } = await params;
  const ctx = await requireTenant();
  const reel = await getReel(ctx.tenant.id, reelId);
  if (!reel || reel.garment.deletedAt) notFound();
  const settings = await getTenantSettings(ctx.tenant.id);
  const url = await getStorage().signRead(reel.sourceImage.storageKey, READ_URL_TTL_SECONDS);
  return (
    <ReelFlow
      image={{ id: reel.sourceImage.id, url, width: reel.sourceImage.width, height: reel.sourceImage.height }}
      garment={{ id: reel.garment.id, title: reel.garment.title }}
      credits={settings?.creditsBalance ?? 0}
      boutiqueName={ctx.tenant.name}
      initialReelId={reel.id}
    />
  );
}

export default function ReelPage({ params }: { params: Promise<{ reelId: string }> }) {
  return (
    <Suspense fallback={<ReelSkeleton />}>
      <Reel params={params} />
    </Suspense>
  );
}
