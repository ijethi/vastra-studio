import { Suspense } from "react";
import { connection } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { readReelSceneRows } from "@/lib/content/store";
import { Skeleton } from "@/components/ui/primitives";
import { ReelSceneEditor } from "./editor";

async function ReelScenes() {
  // Request-time only: the admin console never belongs in a prerendered shell.
  await connection();
  await requirePlatformAdmin();
  const rows = await readReelSceneRows(await getDb());
  const perVibe = ["everyday", "festive", "editorial"].map((v) => `${v} ${rows.filter((r) => r.vibe === v && r.active).length}`).join(" · ");
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-2">
        Active scenes per vibe: {perVibe}. A reel sketches the first nine active scenes of its vibe in sort order; a vibe with no active scenes falls back to the built-in nine. The prompt follows the garment description in the storyboard request, so write it as &quot;she is …&quot;.
      </p>
      <ReelSceneEditor rows={rows.map((s) => ({ id: s.id, vibe: s.vibe, label: s.label, shotType: s.shotType, prompt: s.prompt, active: s.active, sort: s.sort }))} />
    </div>
  );
}

export default function ReelScenesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <ReelScenes />
    </Suspense>
  );
}
