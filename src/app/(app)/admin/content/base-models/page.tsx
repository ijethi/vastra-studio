import { Suspense } from "react";
import { connection } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { readBackdropRows, readBaseModelRows } from "@/lib/content/store";
import { getStorage, READ_URL_TTL_SECONDS } from "@/lib/storage";
import { Skeleton } from "@/components/ui/primitives";
import { BaseModelEditor } from "./editor";

async function BaseModels() {
  // Request-time only: the admin console never belongs in a prerendered shell.
  await connection();
  await requirePlatformAdmin();
  const db = await getDb();
  const [rows, backdrops] = await Promise.all([readBaseModelRows(db), readBackdropRows(db)]);
  const storage = getStorage();
  const keys = rows.map((r) => r.imageKey).filter((k): k is string => Boolean(k));
  const previews = keys.length ? await storage.signReadMany(keys, READ_URL_TTL_SECONDS) : new Map<string, string>();
  // Which library renders already exist per model, so the admin can see what the pipeline will use.
  const renders = await Promise.all(
    rows.map(async (r) => {
      const have: string[] = [];
      for (const b of backdrops) if (await storage.exists(`library/${r.id}/${b.id}.jpg`)) have.push(b.id);
      return [r.id, have] as const;
    }),
  );
  const renderMap = new Map(renders);
  const models = rows.map((r) => ({
    id: r.id,
    label: r.label,
    bodyType: r.bodyType,
    skinTone: r.skinTone,
    ageRange: r.ageRange,
    pose: r.pose,
    imageUrl: r.imageUrl,
    imageKey: r.imageKey,
    previewUrl: r.imageUrl ?? (r.imageKey ? (previews.get(r.imageKey) ?? null) : `/base-models/${r.id}.png`),
    width: r.width,
    height: r.height,
    licenceNote: r.licenceNote,
    active: r.active,
    sort: r.sort,
    renders: renderMap.get(r.id) ?? [],
  }));
  return <BaseModelEditor models={models} backdrops={backdrops.map((b) => ({ id: b.id, label: b.label }))} />;
}

export default function BaseModelsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-[var(--radius-card)]" />}>
      <BaseModels />
    </Suspense>
  );
}
