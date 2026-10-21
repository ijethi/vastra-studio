import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { requireTenant } from "@/lib/auth/session";
import { getTenantSettings } from "@/lib/dal/tenants";
import { getDb, schema } from "@/lib/db";
import { BACKDROPS, BASE_MODELS, DEFAULT_BACKDROP_ID, DEFAULT_BASE_MODEL_ID } from "@/lib/base-models/catalog";
import { DefaultsForm, TeamPanel } from "./settings-forms";
import { Skeleton } from "@/components/ui/primitives";

export const metadata = { title: "Settings" };

async function Settings() {
  const ctx = await requireTenant();
  const db = await getDb();
  const [settings, members, invitations] = await Promise.all([
    getTenantSettings(ctx.tenant.id),
    db
      .select({ id: schema.member.id, role: schema.member.role, name: schema.user.name, email: schema.user.email, userId: schema.user.id })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
      .where(eq(schema.member.organizationId, ctx.tenant.id)),
    db.query.invitation.findMany({ where: eq(schema.invitation.organizationId, ctx.tenant.id) }),
  ]);
  const canEdit = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
      <DefaultsForm
        canEdit={canEdit}
        baseModels={BASE_MODELS.filter((m) => m.active).map((m) => ({ id: m.id, label: m.label, imagePath: m.imagePath }))}
        backdrops={BACKDROPS.map((b) => ({ id: b.id, label: b.label, hex: b.hex }))}
        values={{
          defaultBaseModelId: settings?.defaultBaseModelId ?? DEFAULT_BASE_MODEL_ID,
          defaultBackdrop: settings?.defaultBackdrop ?? DEFAULT_BACKDROP_ID,
          defaultVariations: settings?.defaultVariations ?? 2,
          watermarkEnabled: settings?.watermarkEnabled ?? true,
        }}
        plan={settings?.plan ?? "trial"}
      />
      <TeamPanel
        canInvite={canEdit}
        isOwner={ctx.role === "owner"}
        currentUserId={ctx.user.id}
        members={members}
        pending={invitations.filter((i) => i.status === "pending").map((i) => ({ id: i.id, email: i.email, role: i.role ?? "member" }))}
      />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-2">Boutique</p>
        <h1 className="display-lg">Settings</h1>
      </header>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Settings />
      </Suspense>
    </div>
  );
}
