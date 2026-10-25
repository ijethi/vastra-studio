import "server-only";
import { getDb, type Db } from "@/lib/db";
import { withTenant } from "@/lib/db/tenant";

/**
 * Run a tenant-scoped DAL call inside a transaction that pins
 * `app.tenant_id` for Postgres row-level security (drizzle/rls.sql). The
 * explicit `tenant_id` predicates in each query remain; this adds the second
 * fence so a query that forgets one still cannot cross tenants once the app
 * runs as the `vastra_app` role. On the embedded database it is just a
 * transaction.
 */
export async function scoped<T>(tenantId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  const db = await getDb();
  return withTenant(db, tenantId, fn);
}
