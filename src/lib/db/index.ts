import "server-only";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { env } from "@/env";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

declare global {
   
  var __vastraDb: Promise<Db> | undefined;
}

/**
 * Fill the editable-content tables (base models, backdrops, credit packs,
 * reel scenes, app copy) from the typed defaults when they are empty, so a
 * fresh deploy has content without a manual step. Never fatal: the readers
 * fall back to the same defaults if a table stays empty.
 */
async function seedIfEmpty(db: Db): Promise<void> {
  try {
    const { seedContentIfEmpty } = await import("@/lib/content/store");
    const report = await seedContentIfEmpty(db);
    const seeded = Object.entries(report).filter(([, n]) => n > 0);
    if (seeded.length) console.log(`[db] seeded content: ${seeded.map(([k, n]) => `${k}=${n}`).join(" ")}`);
  } catch (err) {
    console.warn("[db] content seed skipped:", err instanceof Error ? err.message : err);
  }
}

async function connect(): Promise<Db> {
  if (env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: env.DATABASE_POOL_MAX });
    const db = drizzle(pool, { schema });
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seedIfEmpty(db as unknown as Db);
    return db as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? "./.data/pg";
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedIfEmpty(db as unknown as Db);
  return db as unknown as Db;
}

/** True once the database has answered a trivial query; used by /api/health. */
export async function pingDb(): Promise<void> {
  const db = await getDb();
  await db.execute(sql`select 1`);
}

/**
 * One database handle per process. The promise is memoised on globalThis so
 * Next.js hot reloads do not open the embedded database twice.
 */
export function getDb(): Promise<Db> {
  if (!globalThis.__vastraDb) {
    globalThis.__vastraDb = connect().catch((err) => {
      globalThis.__vastraDb = undefined;
      throw err;
    });
  }
  return globalThis.__vastraDb;
}

export { schema };
