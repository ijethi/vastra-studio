-- ============================================================================
-- Vastra Studio: Postgres row-level security (second fence behind the DAL)
-- ============================================================================
--
-- WHAT THIS DOES
--   * Creates a non-superuser login role `vastra_app` (NOBYPASSRLS) that the
--     web tier and the worker should connect as in staging/production.
--   * Enables ROW LEVEL SECURITY on every tenant-owned table and adds one
--     policy per table that only lets `vastra_app` see and write rows whose
--     tenant_id equals the current transaction's tenant.
--   * Grants `vastra_app` the table privileges the application needs.
--
-- HOW THE APP SETS THE TENANT
--   Every tenant-scoped unit of work runs inside a transaction that first sets
--   a transaction-local GUC (see src/lib/db/tenant.ts, `withTenant`):
--
--       BEGIN;
--       SELECT set_config('app.tenant_id', '<organization.id>', true);  -- is_local = true
--       ... application queries ...
--       COMMIT;
--
--   `set_config(..., true)` is the parameterisable form of `SET LOCAL`. The
--   value lives only for that transaction, so it is safe behind a connection
--   pooler in transaction mode (PgBouncer, Neon, Supabase Supavisor): the next
--   transaction on the same backend starts with the setting reset.
--
--   The policies read it through `app_tenant_id()`, which maps "never set" and
--   "reset to empty string after a previous transaction" both to NULL. A NULL
--   tenant makes every policy predicate NULL, i.e. false, so a query that
--   forgot to go through `withTenant` sees no rows and can insert none.
--
-- WHO BYPASSES IT
--   Table owners and superusers are not subject to these policies (we
--   deliberately do NOT use FORCE ROW LEVEL SECURITY). That is what keeps this
--   file safe to apply today: migrations (`pnpm db:migrate`, and the migration
--   run at boot in src/lib/db/index.ts) and the current DAL, which does not
--   yet wrap queries in `withTenant`, keep working while DATABASE_URL points at
--   the owner role. The fence switches on when DATABASE_URL is changed to the
--   `vastra_app` role, which must only happen after the DAL uses `withTenant`.
--
-- HOW TO APPLY
--   Run as the role that owns the schema (the one migrations run as):
--       DATABASE_URL=postgres://owner:...@host/db pnpm db:rls
--   or  psql "$DATABASE_URL" -f drizzle/rls.sql
--   The whole file is idempotent and re-runnable. `pnpm db:rls` also sets the
--   role's password from VASTRA_APP_PASSWORD when that variable is present;
--   otherwise set it yourself:  ALTER ROLE vastra_app PASSWORD '...';
--
-- LOCAL DEVELOPMENT
--   The embedded PGlite database never has this file applied; it runs as a
--   single superuser with no policies, so `withTenant` is a no-op there.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Application role
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vastra_app') THEN
    CREATE ROLE vastra_app
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOBYPASSRLS
      NOINHERIT;
  END IF;
END
$$;

-- Keep the role from ever bypassing RLS, even if it was created elsewhere.
ALTER ROLE vastra_app NOSUPERUSER NOBYPASSRLS;

-- ---------------------------------------------------------------------------
-- 2. Tenant resolver used by every policy
-- ---------------------------------------------------------------------------
-- Returns NULL both when app.tenant_id was never set in this session and when
-- it was reset to '' at the end of an earlier transaction. STABLE lets the
-- planner evaluate it once per statement instead of once per row.
CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')
$$;

REVOKE ALL ON FUNCTION app_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_tenant_id() TO vastra_app;

-- ---------------------------------------------------------------------------
-- 3. Privileges
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO vastra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vastra_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vastra_app;
-- Tables added by future migrations (run by the owner) get the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vastra_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO vastra_app;

-- The app runs drizzle's migrator at boot (src/lib/db/index.ts). With every
-- migration already applied by the owner it only has to read the journal
-- table, but it still issues `CREATE SCHEMA IF NOT EXISTS "drizzle"` and
-- `CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations"`, and Postgres
-- checks CREATE privilege before it checks existence. These grants let that
-- no-op bootstrap pass; `vastra_app` still cannot alter application tables.
DO $$
BEGIN
  EXECUTE format('GRANT CREATE ON DATABASE %I TO vastra_app', current_database());
END
$$;
CREATE SCHEMA IF NOT EXISTS drizzle;
GRANT USAGE, CREATE ON SCHEMA drizzle TO vastra_app;
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO vastra_app;

-- ---------------------------------------------------------------------------
-- 4. Row-level security
-- ---------------------------------------------------------------------------
-- One policy per table, covering SELECT / INSERT / UPDATE / DELETE for the
-- application role. USING filters rows that are visible; WITH CHECK rejects
-- inserts and updates that would write a row belonging to another tenant.
-- Policies are dropped and recreated so the file stays re-runnable.

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant_settings;
CREATE POLICY tenant_isolation ON tenant_settings
  FOR ALL TO vastra_app
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

ALTER TABLE garments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON garments;
CREATE POLICY tenant_isolation ON garments
  FOR ALL TO vastra_app
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON generation_jobs;
CREATE POLICY tenant_isolation ON generation_jobs
  FOR ALL TO vastra_app
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

ALTER TABLE generated_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON generated_images;
CREATE POLICY tenant_isolation ON generated_images
  FOR ALL TO vastra_app
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON credit_ledger;
CREATE POLICY tenant_isolation ON credit_ledger
  FOR ALL TO vastra_app
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON payments;
CREATE POLICY tenant_isolation ON payments
  FOR ALL TO vastra_app
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON share_links;
CREATE POLICY tenant_isolation ON share_links
  FOR ALL TO vastra_app
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());

-- audit_log.tenant_id is nullable: platform-level events (admin console,
-- provider kill switches) are written with tenant_id NULL. Tenants may read
-- only their own rows; they may append their own rows or platform rows, and
-- the log is append-only for the application role.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_log;
DROP POLICY IF EXISTS audit_read ON audit_log;
DROP POLICY IF EXISTS audit_append ON audit_log;
CREATE POLICY audit_read ON audit_log
  FOR SELECT TO vastra_app
  USING (tenant_id = app_tenant_id());
CREATE POLICY audit_append ON audit_log
  FOR INSERT TO vastra_app
  WITH CHECK (tenant_id = app_tenant_id() OR tenant_id IS NULL);
REVOKE UPDATE, DELETE ON audit_log FROM vastra_app;

COMMIT;

-- ---------------------------------------------------------------------------
-- Verifying (as the owner):
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('garments','generation_jobs','generated_images',
--                      'credit_ledger','payments','share_links','audit_log',
--                      'tenant_settings');
--   SELECT * FROM pg_policies WHERE schemaname = 'public';
-- Smoke test (as vastra_app):
--   BEGIN; SELECT count(*) FROM garments;                       -- 0, no tenant set
--   SELECT set_config('app.tenant_id', '<org id>', true);
--   SELECT count(*) FROM garments;                              -- that tenant only
--   ROLLBACK;
-- ---------------------------------------------------------------------------
