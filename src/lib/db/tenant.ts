import { sql } from "drizzle-orm";
import type { Db } from "./index";

/**
 * Runs `fn` inside a transaction whose tenant is pinned for Postgres row-level
 * security. The first statement of the transaction is
 *
 *     SELECT set_config('app.tenant_id', $1, true)
 *
 * which is the parameterised form of `SET LOCAL app.tenant_id = ...` (SET
 * LOCAL itself cannot take a bind parameter). The policies in drizzle/rls.sql
 * read that setting through `app_tenant_id()`, so every query issued through
 * `tx` can only see or write rows belonging to `tenantId`. Because the setting
 * is transaction-local it is reset when the transaction ends, which keeps it
 * safe behind a pooler in transaction mode.
 *
 * In local development the embedded PGlite database never has rls.sql applied
 * and runs as a single superuser with no policies, so the setting is written
 * but has no effect: `withTenant` is then just a transaction.
 *
 * The DAL does not use this yet. It is the entry point for the follow-up that
 * wraps tenant-scoped DAL calls once DATABASE_URL points at the `vastra_app`
 * role; until then the DAL's explicit `tenant_id` predicates are the only fence.
 */
export async function withTenant<T>(
  db: Db,
  tenantId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  if (typeof tenantId !== "string" || tenantId.trim() === "") {
    throw new Error("withTenant: tenantId must be a non-empty string");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
