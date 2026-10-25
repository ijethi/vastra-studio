import { Suspense } from "react";
import { connection } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { readAppContentRows, readReelSceneRows } from "@/lib/content/store";
import { APP_CONTENT_DEFAULTS } from "@/lib/content/types";
import { Skeleton } from "@/components/ui/primitives";
import { ReelSceneEditor } from "./editor";

async function ReelScenes() {
  // Request-time only: the admin console never belongs in a prerendered shell.
  await connection();
  await requirePlatformAdmin();
  const db = await getDb();
  const [rows, copy] = await Promise.all([readReelSceneRows(db), readAppContentRows(db)]);
  // Section blurbs come from the vibe taglines boutiques see, stored or built-in.
  const stored = copy.find((r) => r.key === "reels.vibes")?.value as { vibes?: Array<{ id?: string; tagline?: string }> } | undefined;
  const vibes = APP_CONTENT_DEFAULTS["reels.vibes"].vibes.map((d) => {
    const tagline = stored?.vibes?.find((v) => v?.id === d.id)?.tagline;
    return { id: d.id, label: d.label, tagline: typeof tagline === "string" && tagline ? tagline : d.tagline };
  });
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-6 text-ink-2">
        A reel sketches the first nine live scenes of its vibe in sort order; a vibe with no live scenes falls back to the built-in nine. The prompt follows the garment description in the storyboard request, so write it as &quot;she is …&quot;.
      </p>
      <ReelSceneEditor rows={rows.map((s) => ({ id: s.id, vibe: s.vibe, label: s.label, shotType: s.shotType, prompt: s.prompt, active: s.active, sort: s.sort }))} vibes={vibes} />
    </div>
  );
}

export default function ReelScenesPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 rounded-[var(--radius-card)]" />
          ))}
        </div>
      }
    >
      <ReelScenes />
    </Suspense>
  );
}
