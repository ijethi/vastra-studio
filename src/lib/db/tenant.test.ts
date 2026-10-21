import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Db } from "./index";
import { withTenant } from "./tenant";

/* ------------------------------------------------------------------ */
/* 1. Shape of the statements, with a fake database                    */
/* ------------------------------------------------------------------ */

type Call = { sql: string; params: unknown[] };

/** Minimal stand-in for Db: records executed SQL and hands itself to `fn`. */
function fakeDb() {
  const dialect = new PgDialect();
  const calls: Call[] = [];
  const tx = {
    async execute(query: SQL) {
      const q = dialect.sqlToQuery(query);
      calls.push({ sql: q.sql, params: q.params });
      return { rows: [] };
    },
  };
  const db = {
    async transaction<T>(fn: (t: typeof tx) => Promise<T>) {
      calls.push({ sql: "BEGIN", params: [] });
      try {
        const out = await fn(tx);
        calls.push({ sql: "COMMIT", params: [] });
        return out;
      } catch (err) {
        calls.push({ sql: "ROLLBACK", params: [] });
        throw err;
      }
    },
  };
  return { db: db as unknown as Db, tx, calls };
}

describe("withTenant (statement shape)", () => {
  it("pins the tenant as the first statement of the transaction, parameterised", async () => {
    const { db, tx, calls } = fakeDb();
    const result = await withTenant(db, "org_123", async (handle) => {
      assert.equal(handle as unknown, tx, "fn receives the transaction handle");
      return "done";
    });
    assert.equal(result, "done");
    assert.deepEqual(
      calls.map((c) => c.sql),
      ["BEGIN", "select set_config('app.tenant_id', $1, true)", "COMMIT"],
    );
    assert.deepEqual(calls[1].params, ["org_123"]);
  });

  it("never interpolates the tenant id into the SQL text", async () => {
    const { db, calls } = fakeDb();
    const hostile = "x'; drop table garments; --";
    await withTenant(db, hostile, async () => undefined);
    assert.ok(!calls[1].sql.includes("drop table"));
    assert.deepEqual(calls[1].params, [hostile]);
  });

  it("rolls back and rethrows when fn throws", async () => {
    const { db, calls } = fakeDb();
    await assert.rejects(
      withTenant(db, "org_123", async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.equal(calls.at(-1)?.sql, "ROLLBACK");
  });

  it("refuses an empty tenant id before opening a transaction", async () => {
    const { db, calls } = fakeDb();
    await assert.rejects(withTenant(db, "", async () => undefined), /non-empty/);
    await assert.rejects(withTenant(db, "   ", async () => undefined), /non-empty/);
    await assert.rejects(
      withTenant(db, undefined as unknown as string, async () => undefined),
      /non-empty/,
    );
    assert.equal(calls.length, 0);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Real transaction semantics, with in-memory PGlite                */
/* ------------------------------------------------------------------ */

describe("withTenant (PGlite)", () => {
  let client: import("@electric-sql/pglite").PGlite;
  let db: Db;

  before(async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    client = new PGlite(); // in-memory, nothing written to disk
    db = drizzle(client) as unknown as Db;
    await db.execute(sql`create table t (id int primary key)`);
  });

  after(async () => {
    await client?.close();
  });

  /** Db#execute is typed against a generic driver; narrow the first row. */
  async function firstRow<T>(handle: Db, query: SQL): Promise<T> {
    const result = (await handle.execute(query)) as { rows: T[] };
    return result.rows[0];
  }

  const current = sql`select nullif(current_setting('app.tenant_id', true), '') as tenant`;
  type TenantRow = { tenant: string | null };
  type CountRow = { n: number };

  it("exposes app.tenant_id inside the transaction only", async () => {
    const inside = await withTenant(db, "org_abc", (tx) => firstRow<TenantRow>(tx, current));
    assert.equal(inside.tenant, "org_abc");

    const outside = await firstRow<TenantRow>(db, current);
    assert.equal(outside.tenant, null);
  });

  it("commits the work when fn resolves", async () => {
    await withTenant(db, "org_abc", async (tx) => {
      await tx.execute(sql`insert into t values (1)`);
    });
    const r = await firstRow<CountRow>(db, sql`select count(*)::int as n from t`);
    assert.equal(r.n, 1);
  });

  it("rolls the work back when fn rejects", async () => {
    await assert.rejects(
      withTenant(db, "org_abc", async (tx) => {
        await tx.execute(sql`insert into t values (2)`);
        throw new Error("abort");
      }),
      /abort/,
    );
    const r = await firstRow<CountRow>(db, sql`select count(*)::int as n from t`);
    assert.equal(r.n, 1);
  });
});
