import { Suspense } from "react";
import { connection } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { readBackdropRows } from "@/lib/content/store";
import { Skeleton } from "@/components/ui/primitives";
import { BackdropEditor } from "./editor";

async function Backdrops() {
  // Request-time only: the admin console never belongs in a prerendered shell.
  await connection();
  await requirePlatformAdmin();
  const rows = await readBackdropRows(await getDb());
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-2">
        {rows.filter((b) => b.active).length} active of {rows.length}. The hex colour fills the development placeholder and is the prompt hint for the real renders; the description is read by the person generator. Deleting a backdrop that past jobs used only affects their labels.
      </p>
      <BackdropEditor rows={rows.map((b) => ({ id: b.id, label: b.label, description: b.description, hex: b.hex, kind: b.kind, active: b.active, sort: b.sort }))} />
    </div>
  );
}

export default function BackdropsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Backdrops />
    </Suspense>
  );
}
