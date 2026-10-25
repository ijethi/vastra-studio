import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { requireTenant } from "@/lib/auth/session";
import { getTenantSettings } from "@/lib/dal/tenants";
import { getDb, schema } from "@/lib/db";
import { getActiveBaseModels, getBackdrops, getStudioDefaults } from "@/lib/dal/content";
import { ContactForm, DangerZone, DefaultsForm, TeamPanel } from "./settings-forms";
import { getBoutiqueContact } from "@/lib/dal/share";
import { Skeleton } from "@/components/ui/primitives";

export const metadata = { title: "Settings" };

async function Settings() {
  const ctx = await requireTenant();
  const db = await getDb();
  const [settings, members, invitations, contact, baseModels, backdrops, houseDefaults] = await Promise.all([
    getTenantSettings(ctx.tenant.id),
    db
      .select({ id: schema.member.id, role: schema.member.role, name: schema.user.name, email: schema.user.email, userId: schema.user.id })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
      .where(eq(schema.member.organizationId, ctx.tenant.id)),
    db.query.invitation.findMany({ where: eq(schema.invitation.organizationId, ctx.tenant.id) }),
    getBoutiqueContact(ctx.tenant.id),
    getActiveBaseModels(),
    getBackdrops(),
    getStudioDefaults(),
  ]);
  const canEdit = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
      <DefaultsForm
        canEdit={canEdit}
        baseModels={baseModels.map((m) => ({ id: m.id, label: m.label, imagePath: m.imagePath }))}
        backdrops={backdrops.map((b) => ({ id: b.id, label: b.label, hex: b.hex }))}
        values={{
          defaultBaseModelId: baseModels.some((m) => m.id === settings?.defaultBaseModelId) ? settings!.defaultBaseModelId! : houseDefaults.baseModelId,
          defaultBackdrop: backdrops.some((b) => b.id === settings?.defaultBackdrop) ? settings!.defaultBackdrop : houseDefaults.backdropId,
          defaultVariations: settings?.defaultVariations ?? houseDefaults.variations,
          watermarkEnabled: settings?.watermarkEnabled ?? true,
          autoGenerate: settings?.autoGenerate ?? true,
        }}
        plan={settings?.plan ?? "trial"}
      />
      <ContactForm canEdit={canEdit} values={{ whatsapp: contact.whatsapp ?? "", instagram: contact.instagram ?? "", city: contact.city ?? "" }} />
      <TeamPanel
        canInvite={canEdit}
        isOwner={ctx.role === "owner"}
        currentUserId={ctx.user.id}
        members={members}
        pending={invitations.filter((i) => i.status === "pending").map((i) => ({ id: i.id, email: i.email, role: i.role ?? "member" }))}
      />
      {ctx.role === "owner" ? <DangerZone boutiqueName={ctx.tenant.name} /> : null}
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
