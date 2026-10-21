/**
 * Applies drizzle/rls.sql (row-level security policies and the `vastra_app`
 * role) to the Postgres database at DATABASE_URL, using the pg driver.
 *
 *   DATABASE_URL=postgres://owner:...@host/db pnpm db:rls
 *   VASTRA_APP_PASSWORD=... DATABASE_URL=... pnpm db:rls   # also sets the role password
 *
 * Run it as the role that owns the schema (the one migrations run as), after
 * `pnpm db:migrate`. The SQL is idempotent, so re-running is safe. It is never
 * applied to the embedded PGlite database used in development.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const RLS_TABLES = [
  "tenant_settings",
  "garments",
  "generation_jobs",
  "generated_images",
  "credit_ledger",
  "payments",
  "share_links",
  "audit_log",
  "reel_jobs",
  "reel_assets",
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required and must point at the schema owner (not vastra_app).",
    );
  }
  if (/^postgres(ql)?:\/\/vastra_app[:@]/i.test(url)) {
    throw new Error("DATABASE_URL connects as vastra_app; run db:rls as the schema owner.");
  }

  const file = path.resolve(process.cwd(), "drizzle", "rls.sql");
  const script = readFileSync(file, "utf8");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // The file contains its own BEGIN/COMMIT. pg's simple query protocol runs
    // the whole multi-statement text in one round trip.
    await client.query(script);
    console.log(`Applied ${path.relative(process.cwd(), file)}.`);

    const password = process.env.VASTRA_APP_PASSWORD;
    if (password) {
      // ALTER ROLE cannot take a bind parameter; escapeLiteral quotes safely.
      await client.query(`ALTER ROLE vastra_app PASSWORD ${client.escapeLiteral(password)}`);
      console.log("Set password for role vastra_app.");
    } else {
      console.log(
        "VASTRA_APP_PASSWORD not set; set one with: ALTER ROLE vastra_app PASSWORD '...';",
      );
    }

    const { rows } = await client.query<{ relname: string; relrowsecurity: boolean; policies: string }>(
      `select c.relname,
              c.relrowsecurity,
              count(p.policyname)::text as policies
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         left join pg_policies p on p.tablename = c.relname and p.schemaname = n.nspname
        where n.nspname = 'public' and c.relname = any($1::text[])
        group by c.relname, c.relrowsecurity
        order by c.relname`,
      [RLS_TABLES],
    );
    const missing = RLS_TABLES.filter((t) => !rows.some((r) => r.relname === t));
    for (const r of rows) {
      console.log(
        `  ${r.relname.padEnd(18)} rls=${r.relrowsecurity ? "on " : "OFF"} policies=${r.policies}`,
      );
    }
    if (missing.length) {
      throw new Error(`Tables not found (run migrations first): ${missing.join(", ")}`);
    }
    if (rows.some((r) => !r.relrowsecurity)) {
      throw new Error("Row-level security is not enabled on every tenant table.");
    }
  } finally {
    await client.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
