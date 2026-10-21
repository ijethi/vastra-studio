import "server-only";
import * as schema from "./schema";
import { env } from "@/env";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

declare global {
   
  var __vastraDb: Promise<Db> | undefined;
}

async function connect(): Promise<Db> {
  if (env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
    const db = drizzle(pool, { schema });
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder: "./drizzle" });
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
  return db as unknown as Db;
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
