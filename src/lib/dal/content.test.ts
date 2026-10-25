import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The content readers against a throwaway embedded database: the boot-time
 * seed fills the tables, edits are visible after the memo is invalidated,
 * and every reader falls back to the typed defaults when its table yields
 * nothing or the database is unreachable. The `use cache` wrappers are not
 * exercised here (they need the App Router); they only delegate to these.
 */
const tmp = mkdtempSync(path.join(os.tmpdir(), "vastra-content-"));
process.env.PGLITE_DIR = path.join(tmp, "pg");
process.env.LOCAL_STORAGE_DIR = path.join(tmp, "storage");
delete process.env.DATABASE_URL;
delete process.env.REDIS_URL;
process.env.STORAGE_DRIVER = "local";

type ContentDal = typeof import("./content");
type Store = typeof import("@/lib/content/store");
type DbModule = typeof import("@/lib/db");

let dal: ContentDal;
let store: Store;
let dbm: DbModule;

before(async () => {
  dal = await import("./content");
  store = await import("@/lib/content/store");
  dbm = await import("@/lib/db");
});

describe("content DAL", () => {
  it("serves the seeded catalogue from the database after boot", async () => {
    const models = await dal.loadBaseModels({ fresh: true });
    assert.equal(models.length, 32);
    assert.ok(models.every((m) => m.active));
    assert.equal(models[0].imagePath, `/base-models/${models[0].id}.png`, "no upload yet: development placeholder");
    const backdrops = await dal.loadBackdrops({ fresh: true });
    assert.equal(backdrops.length, 6);
    const packs = await dal.loadCreditPacks({ fresh: true });
    assert.deepEqual(packs.map((p) => p.id), ["starter", "boutique", "season"]);
    const festive = await dal.loadReelScenes("festive");
    assert.equal(festive.length, 9);
    const hero = await dal.loadAppContent("landing.hero");
    assert.equal(hero.lines.join(" "), "Your suit, on a model, in a minute.");
  });

  it("shows an edit only after the memo is invalidated or bypassed", async () => {
    const db = await dbm.getDb();
    const rows = await store.readBaseModelRows(db);
    const target = rows[0];
    await store.upsertBaseModel(db, { ...target, label: "Edited label", createdAt: undefined, updatedAt: undefined } as unknown as Parameters<typeof store.upsertBaseModel>[1]);
    const stale = await dal.loadBaseModels();
    assert.notEqual(stale.find((m) => m.id === target.id)?.label, "Edited label", "memo still holds the old value");
    dal.invalidateContentMemo();
    const fresh = await dal.loadBaseModels();
    assert.equal(fresh.find((m) => m.id === target.id)?.label, "Edited label");
  });

  it("uses an uploaded preview when the row has an image key", async () => {
    const db = await dbm.getDb();
    const [row] = await store.readBaseModelRows(db);
    await store.setBaseModelImage(db, row.id, `library/${row.id}/preview.jpg`, { width: 100, height: 150 });
    const models = await dal.loadBaseModels({ fresh: true });
    const m = models.find((x) => x.id === row.id)!;
    assert.match(m.imagePath, /^\/api\/storage\/read\?token=/);
    assert.equal(m.width, 100);
  });

  it("falls back to the default backdrops when none is active", async () => {
    const db = await dbm.getDb();
    for (const b of await store.readBackdropRows(db)) await store.upsertBackdrop(db, { ...b, active: false });
    const backdrops = await dal.loadBackdrops({ fresh: true });
    assert.equal(backdrops.length, 6, "defaults, not an empty studio");
    for (const b of await store.readBackdropRows(db)) await store.upsertBackdrop(db, { ...b, active: true });
  });

  it("falls back per vibe when a vibe has no active scenes", async () => {
    const db = await dbm.getDb();
    const scenes = await store.readReelSceneRows(db);
    for (const s of scenes.filter((x) => x.vibe === "festive")) await store.upsertReelScene(db, { ...s, active: false });
    const everyday = scenes.filter((x) => x.vibe === "everyday");
    await store.upsertReelScene(db, { ...everyday[0], label: "Edited scene" });
    dal.invalidateContentMemo();
    assert.equal((await dal.loadReelScenes("festive")).length, 9, "defaults for festive");
    assert.equal((await dal.loadReelScenes("everyday"))[0].label, "Edited scene", "database rows for everyday");
    for (const s of scenes.filter((x) => x.vibe === "festive")) await store.upsertReelScene(db, { ...s, active: true });
  });

  it("coerces malformed app copy back to the defaults field by field", async () => {
    const db = await dbm.getDb();
    await store.setAppContent(db, "landing.pricing", { heading: "Custom heading", blurb: 42, extra: true }, null);
    dal.invalidateContentMemo();
    const pricing = await dal.loadAppContent("landing.pricing");
    assert.equal(pricing.heading, "Custom heading");
    assert.equal(pricing.blurb, (store.defaultContent().appContent["landing.pricing"] as { blurb: string }).blurb);
    assert.equal((pricing as Record<string, unknown>).extra, undefined);
  });

  it("resolves studio defaults to an active model and backdrop", async () => {
    const db = await dbm.getDb();
    await store.setAppContent(db, "studio.defaults", { baseModelId: "bm-does-not-exist", backdropId: "studio-ivory", variations: 9 }, null);
    dal.invalidateContentMemo();
    const d = await dal.loadStudioDefaults();
    assert.equal(d.backdropId, "studio-ivory");
    assert.equal(d.variations, 4, "clamped to the maximum");
    assert.ok((await dal.loadBaseModels()).some((m) => m.id === d.baseModelId && m.active));
  });

  it("falls back to the defaults when the database is unreachable", async () => {
    const real = globalThis.__vastraDb;
    const down = Promise.reject(new Error("database down"));
    down.catch(() => {});
    globalThis.__vastraDb = down as typeof real;
    try {
      dal.invalidateContentMemo();
      const packs = await dal.loadCreditPacks();
      assert.equal(packs.length, 3);
      assert.equal(packs[1].amountMinor, 135_000);
      const models = await dal.loadBaseModels();
      assert.equal(models.length, 32);
      assert.equal((await dal.loadAppContent("billing.copy")).packsHeading, "Credit packs");
    } finally {
      globalThis.__vastraDb = real;
      dal.invalidateContentMemo();
    }
  });
});

describe("seedContent", () => {
  it("seeds only empty tables unless forced, and new app-content keys per key", async () => {
    const db = await dbm.getDb();
    const report = await store.seedContent(db);
    assert.deepEqual(report, { baseModels: 0, backdrops: 0, creditPacks: 0, reelScenes: 0, appContent: 0 });
    await db.delete(dbm.schema.appContent);
    const again = await store.seedContent(db);
    assert.equal(again.appContent, store.seedRows().appContent.length);
    const forced = await store.seedContent(db, { force: true });
    assert.equal(forced.baseModels, 32);
    assert.equal(forced.reelScenes, 27);
    const rows = await store.readBaseModelRows(db);
    assert.ok(rows.every((r) => !r.label.includes("Edited")), "force restores the default labels");
  });
});
