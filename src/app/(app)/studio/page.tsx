import { Suspense } from "react";
import { requireTenant } from "@/lib/auth/session";
import { getTenantSettings } from "@/lib/dal/tenants";
import { getGarment } from "@/lib/dal/garments";
import { getStorage, READ_URL_TTL_SECONDS } from "@/lib/storage";
import { getActiveBaseModels, getBackdrops, getStudioDefaults } from "@/lib/dal/content";
import { StudioWorkbench } from "@/components/studio/workbench";
import { Skeleton } from "@/components/ui/primitives";

export const metadata = { title: "Studio" };

async function Studio({ searchParams }: { searchParams: Promise<{ garment?: string }> }) {
  const { garment: garmentId } = await searchParams;
  const ctx = await requireTenant();
  // Catalogue and house defaults come from the content tables (request-cached, admin-editable).
  const [settings, baseModels, backdrops, houseDefaults] = await Promise.all([getTenantSettings(ctx.tenant.id), getActiveBaseModels(), getBackdrops(), getStudioDefaults()]);
  const storage = getStorage();

  const initialGarment = garmentId ? await getGarment(ctx.tenant.id, garmentId) : null;
  const initial = initialGarment
    ? {
        id: initialGarment.id,
        title: initialGarment.title,
        category: initialGarment.category,
        status: initialGarment.status,
        thumbUrl: await storage.signRead(initialGarment.thumbKey, READ_URL_TTL_SECONDS),
        analysis: initialGarment.analysis ?? null,
      }
    : null;

  return (
    <StudioWorkbench
      baseModels={baseModels}
      backdrops={backdrops}
      defaults={{
        // A boutique default that the admin has since retired falls back to the house default.
        baseModelId: baseModels.some((m) => m.id === settings?.defaultBaseModelId) ? settings!.defaultBaseModelId! : houseDefaults.baseModelId,
        backdrop: backdrops.some((b) => b.id === settings?.defaultBackdrop) ? settings!.defaultBackdrop : houseDefaults.backdropId,
        variations: settings?.defaultVariations ?? houseDefaults.variations,
        autoGenerate: settings?.autoGenerate ?? true,
      }}
      credits={settings?.creditsBalance ?? 0}
      initialGarment={initial}
      boutiqueName={ctx.tenant.name}
    />
  );
}

export default function StudioPage({ searchParams }: { searchParams: Promise<{ garment?: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-[420px]" />
        </div>
      }
    >
      <Studio searchParams={searchParams} />
    </Suspense>
  );
}
