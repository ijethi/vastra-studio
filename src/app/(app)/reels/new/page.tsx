import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/auth/session";
import { getImage } from "@/lib/dal/jobs";
import { getTenantSettings } from "@/lib/dal/tenants";
import { getStorage, READ_URL_TTL_SECONDS } from "@/lib/storage";
import { ReelFlow } from "@/components/reels/reel-flow";
import { ReelSkeleton } from "@/components/reels/reel-skeleton";

export const metadata = { title: "Make a reel" };

async function NewReel({ searchParams }: { searchParams: Promise<{ image?: string }> }) {
  const { image: imageId } = await searchParams;
  const ctx = await requireTenant();
  const image = imageId ? await getImage(ctx.tenant.id, imageId) : null;
  if (!image || image.garment.deletedAt) redirect("/gallery");
  const settings = await getTenantSettings(ctx.tenant.id);
  const url = await getStorage().signRead(image.storageKey, READ_URL_TTL_SECONDS);
  return (
    <ReelFlow
      image={{ id: image.id, url, width: image.width, height: image.height }}
      garment={{ id: image.garment.id, title: image.garment.title }}
      credits={settings?.creditsBalance ?? 0}
      boutiqueName={ctx.tenant.name}
    />
  );
}

export default function NewReelPage({ searchParams }: { searchParams: Promise<{ image?: string }> }) {
  return (
    <Suspense fallback={<ReelSkeleton />}>
      <NewReel searchParams={searchParams} />
    </Suspense>
  );
}
