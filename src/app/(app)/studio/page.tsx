import { Suspense } from "react";
import { requireTenant } from "@/lib/auth/session";
import { getTenantSettings } from "@/lib/dal/tenants";
import { getGarment } from "@/lib/dal/garments";
import { getStorage, READ_URL_TTL_SECONDS } from "@/lib/storage";
import { BACKDROPS, BASE_MODELS, DEFAULT_BACKDROP_ID, DEFAULT_BASE_MODEL_ID } from "@/lib/base-models/catalog";
import { StudioWorkbench } from "@/components/studio/workbench";
import { Skeleton } from "@/components/ui/primitives";

export const metadata = { title: "Studio" };

async function Studio({ searchParams }: { searchParams: Promise<{ garment?: string }> }) {
  const { garment: garmentId } = await searchParams;
  const ctx = await requireTenant();
  const settings = await getTenantSettings(ctx.tenant.id);
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
      baseModels={BASE_MODELS.filter((m) => m.active)}
      backdrops={BACKDROPS}
      defaults={{
        baseModelId: settings?.defaultBaseModelId ?? DEFAULT_BASE_MODEL_ID,
        backdrop: settings?.defaultBackdrop ?? DEFAULT_BACKDROP_ID,
        variations: settings?.defaultVariations ?? 2,
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
