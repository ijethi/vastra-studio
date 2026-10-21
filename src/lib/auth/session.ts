import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getAuth } from "./auth";
import { getDb, schema } from "@/lib/db";
import { platformAdminEmails } from "@/env";
import { ensureTenantSettings } from "@/lib/dal/tenants";

export type Role = "owner" | "admin" | "member";

export type SessionContext = {
  user: { id: string; email: string; name: string; image: string | null };
  sessionId: string;
  isPlatformAdmin: boolean;
  activeTenantId: string | null;
};

export type TenantContext = SessionContext & {
  tenant: { id: string; name: string; slug: string; logo: string | null };
  role: Role;
};

/** Read the signed-in user. Never cached on the server: it reads the request cookie. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const auth = await getAuth();
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  const email = result.user.email.toLowerCase();
  return {
    user: { id: result.user.id, email, name: result.user.name, image: result.user.image ?? null },
    sessionId: result.session.id,
    isPlatformAdmin: platformAdminEmails.has(email),
    activeTenantId: (result.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
  };
}

export async function requireUser(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/sign-in");
  return ctx;
}

/**
 * The tenant the user is acting in, with their role verified against the
 * membership table (never trusted from the client). Users without a boutique
 * are sent to onboarding.
 */
export async function requireTenant(): Promise<TenantContext> {
  const ctx = await requireUser();
  const db = await getDb();

  let tenantId = ctx.activeTenantId;
  let membership = tenantId
    ? await db.query.member.findFirst({ where: and(eq(schema.member.userId, ctx.user.id), eq(schema.member.organizationId, tenantId)) })
    : undefined;

  if (!membership) {
    // Fall back to the first boutique the user belongs to.
    membership = await db.query.member.findFirst({ where: eq(schema.member.userId, ctx.user.id) });
    if (!membership) redirect("/onboarding");
    tenantId = membership.organizationId;
    const auth = await getAuth();
    try {
      await auth.api.setActiveOrganization({ headers: await headers(), body: { organizationId: tenantId } });
    } catch {
      // Non-fatal: the request still has a valid tenant via membership.
    }
  }

  const org = await db.query.organization.findFirst({ where: eq(schema.organization.id, tenantId!) });
  if (!org) redirect("/onboarding");
  await ensureTenantSettings(org.id, ctx.user.id);

  return {
    ...ctx,
    activeTenantId: org.id,
    tenant: { id: org.id, name: org.name, slug: org.slug, logo: org.logo ?? null },
    role: (membership.role === "owner" || membership.role === "admin" ? membership.role : "member") as Role,
  };
}

export async function requireRole(roles: Role[]): Promise<TenantContext> {
  const ctx = await requireTenant();
  if (!roles.includes(ctx.role)) throw new Error("You do not have permission to do that.");
  return ctx;
}

export async function requirePlatformAdmin(): Promise<SessionContext> {
  const ctx = await requireUser();
  if (!ctx.isPlatformAdmin) redirect("/studio");
  return ctx;
}
