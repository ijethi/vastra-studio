import { Suspense } from "react";
import { connection } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { readAppContentRows } from "@/lib/content/store";
import { APP_CONTENT_DEFAULTS, APP_CONTENT_DESCRIPTIONS, APP_CONTENT_KEYS } from "@/lib/content/types";
import { Skeleton } from "@/components/ui/primitives";
import { AppCopyEditor } from "./editor";

async function AppCopy() {
  // Request-time only: the admin console never belongs in a prerendered shell.
  await connection();
  await requirePlatformAdmin();
  const rows = await readAppContentRows(await getDb());
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const entries = APP_CONTENT_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      description: APP_CONTENT_DESCRIPTIONS[key],
      json: JSON.stringify(row?.value ?? APP_CONTENT_DEFAULTS[key], null, 2),
      defaults: JSON.stringify(APP_CONTENT_DEFAULTS[key], null, 2),
      updatedAt: row ? row.updatedAt.toLocaleString("en-IN") : null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-2">
        Each key is a small JSON object. Fields you leave out or mistype fall back to the built-in value for that field, so a bad edit never blanks a page. The landing page reads landing.* through the content DAL once it is wired to it.
      </p>
      <AppCopyEditor entries={entries} />
    </div>
  );
}

export default function AppCopyPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <AppCopy />
    </Suspense>
  );
}
