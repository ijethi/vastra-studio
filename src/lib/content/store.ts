import { asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import type { ReelShotType, ReelVibe } from "@/lib/db/schema";
import { BASE_MODELS, BACKDROPS, type AgeRange, type Backdrop, type BaseModel, type BodyType, type Pose, type SkinTone } from "@/lib/base-models/catalog";
import { CREDIT_PACKS } from "@/lib/billing/packs";
import { SCENES, type Scene } from "@/lib/reels/scenes";
import { APP_CONTENT_DEFAULTS, APP_CONTENT_KEYS, coerceAppContent, type AppContentKey, type AppContentMap } from "./types";

/**
 * Database-backed content store. Pure functions over a `Db` handle so the
 * seed script, the boot-time seeder, the admin console and the unit tests
 * share one implementation. The typed defaults in the old hardcoded modules
 * remain the seed source and the offline fallback.
 */

export type CreditPack = { id: string; label: string; blurb: string; credits: number; amountMinor: number; currency: string };

export type ContentSnapshot = {
  baseModels: BaseModel[];
  backdrops: Backdrop[];
  creditPacks: CreditPack[];
  scenes: Record<ReelVibe, Scene[]>;
  appContent: Partial<Record<AppContentKey, unknown>>;
};

/* ------------------------------- defaults ------------------------------ */

export const DEFAULT_CREDIT_PACKS: CreditPack[] = CREDIT_PACKS.map((p) => ({ ...p, currency: "INR" }));

export function defaultContent(): ContentSnapshot {
  return {
    baseModels: BASE_MODELS.map((m) => ({ ...m })),
    backdrops: BACKDROPS.map((b) => ({ ...b })),
    creditPacks: DEFAULT_CREDIT_PACKS.map((p) => ({ ...p })),
    scenes: { festive: [...SCENES.festive], everyday: [...SCENES.everyday], editorial: [...SCENES.editorial] },
    appContent: { ...APP_CONTENT_DEFAULTS },
  };
}

/* -------------------------------- mapping ------------------------------ */

const BODY_TYPES = new Set<BodyType>(["slim", "regular", "curvy", "plus"]);
const SKIN_TONES = new Set<SkinTone>(["fair", "wheatish", "dusky", "deep"]);
const AGE_RANGES = new Set<AgeRange>(["20s", "30s", "40s"]);
const POSES = new Set<Pose>(["front", "three-quarter"]);
const SHOT_TYPES = new Set<ReelShotType>(["wide-hook", "full-body", "movement", "detail", "hero-portrait"]);
const VIBES = new Set<ReelVibe>(["everyday", "festive", "editorial"]);

export const isBodyType = (v: string): v is BodyType => BODY_TYPES.has(v as BodyType);
export const isSkinTone = (v: string): v is SkinTone => SKIN_TONES.has(v as SkinTone);
export const isAgeRange = (v: string): v is AgeRange => AGE_RANGES.has(v as AgeRange);
export const isPose = (v: string): v is Pose => POSES.has(v as Pose);
export const isShotType = (v: string): v is ReelShotType => SHOT_TYPES.has(v as ReelShotType);
export const isVibe = (v: string): v is ReelVibe => VIBES.has(v as ReelVibe);

/** A row whose enum columns were hand-edited to something unknown is skipped rather than crashing the studio. */
export function baseModelFromRow(row: schema.BaseModelRow, resolveImage: (row: schema.BaseModelRow) => string): BaseModel | null {
  if (!isBodyType(row.bodyType) || !isSkinTone(row.skinTone) || !isAgeRange(row.ageRange)) return null;
  return {
    id: row.id,
    label: row.label,
    bodyType: row.bodyType,
    skinTone: row.skinTone,
    ageRange: row.ageRange,
    pose: isPose(row.pose) ? row.pose : "front",
    imagePath: resolveImage(row),
    width: row.width,
    height: row.height,
    licenceNote: row.licenceNote,
    active: row.active,
  };
}

export function backdropFromRow(row: schema.BackdropRow): Backdrop {
  const kind = row.kind === "interior" || row.kind === "outdoor" || row.kind === "festive" ? row.kind : "studio";
  return { id: row.id, label: row.label, description: row.description, hex: row.hex, kind };
}

export function creditPackFromRow(row: schema.CreditPackRow): CreditPack {
  return { id: row.id, label: row.label, blurb: row.blurb, credits: row.credits, amountMinor: row.amountMinor, currency: row.currency };
}

/* --------------------------------- reads ------------------------------- */

export async function readBaseModelRows(db: Db): Promise<schema.BaseModelRow[]> {
  return db.select().from(schema.baseModels).orderBy(asc(schema.baseModels.sort), asc(schema.baseModels.id));
}

export async function readBackdropRows(db: Db): Promise<schema.BackdropRow[]> {
  return db.select().from(schema.backdrops).orderBy(asc(schema.backdrops.sort), asc(schema.backdrops.id));
}

export async function readCreditPackRows(db: Db): Promise<schema.CreditPackRow[]> {
  return db.select().from(schema.creditPacks).orderBy(asc(schema.creditPacks.sort), asc(schema.creditPacks.id));
}

export async function readReelSceneRows(db: Db): Promise<schema.ReelSceneRow[]> {
  return db.select().from(schema.reelScenes).orderBy(asc(schema.reelScenes.vibe), asc(schema.reelScenes.sort), asc(schema.reelScenes.id));
}

export async function readAppContentRows(db: Db) {
  return db.select().from(schema.appContent).orderBy(asc(schema.appContent.key));
}

/** Every row (active or not) mapped to the public type; the studio filters on `active`. An empty table yields an empty list. */
export async function readBaseModels(db: Db, resolveImage: (row: schema.BaseModelRow) => string): Promise<BaseModel[]> {
  const rows = await readBaseModelRows(db);
  return rows.map((r) => baseModelFromRow(r, resolveImage)).filter((m): m is BaseModel => m !== null);
}

export async function readBackdrops(db: Db): Promise<Backdrop[]> {
  const rows = await db.select().from(schema.backdrops).where(eq(schema.backdrops.active, true)).orderBy(asc(schema.backdrops.sort), asc(schema.backdrops.id));
  return rows.map(backdropFromRow);
}

export async function readCreditPacks(db: Db): Promise<CreditPack[]> {
  const rows = await db.select().from(schema.creditPacks).where(eq(schema.creditPacks.active, true)).orderBy(asc(schema.creditPacks.sort), asc(schema.creditPacks.id));
  return rows.map(creditPackFromRow);
}

export async function readReelScenes(db: Db): Promise<Record<ReelVibe, Scene[]>> {
  const rows = await db.select().from(schema.reelScenes).where(eq(schema.reelScenes.active, true)).orderBy(asc(schema.reelScenes.sort), asc(schema.reelScenes.id));
  const out: Record<ReelVibe, Scene[]> = { everyday: [], festive: [], editorial: [] };
  for (const r of rows) {
    if (!isVibe(r.vibe) || !isShotType(r.shotType)) continue;
    out[r.vibe].push({ label: r.label, shotType: r.shotType, prompt: r.prompt });
  }
  return out;
}

export async function readAppContent(db: Db): Promise<Partial<Record<AppContentKey, unknown>>> {
  const rows = await readAppContentRows(db);
  const out: Partial<Record<AppContentKey, unknown>> = {};
  for (const r of rows) out[r.key as AppContentKey] = r.value;
  return out;
}

export function appContentValue<K extends AppContentKey>(stored: Partial<Record<AppContentKey, unknown>>, key: K): AppContentMap[K] {
  return coerceAppContent(key, stored[key]);
}

/* -------------------------------- writes ------------------------------- */

export type BaseModelInput = Omit<schema.BaseModelRow, "createdAt" | "updatedAt">;
export type BackdropInput = Omit<schema.BackdropRow, "createdAt" | "updatedAt">;
export type CreditPackInput = Omit<schema.CreditPackRow, "createdAt" | "updatedAt">;
export type ReelSceneInput = Omit<schema.ReelSceneRow, "createdAt" | "updatedAt">;

export async function upsertBaseModel(db: Db, input: BaseModelInput): Promise<void> {
  const { id, ...rest } = input;
  await db
    .insert(schema.baseModels)
    .values({ id, ...rest })
    .onConflictDoUpdate({ target: schema.baseModels.id, set: { ...rest, updatedAt: new Date() } });
}

export async function upsertBackdrop(db: Db, input: BackdropInput): Promise<void> {
  const { id, ...rest } = input;
  await db
    .insert(schema.backdrops)
    .values({ id, ...rest })
    .onConflictDoUpdate({ target: schema.backdrops.id, set: { ...rest, updatedAt: new Date() } });
}

export async function upsertCreditPack(db: Db, input: CreditPackInput): Promise<void> {
  const { id, ...rest } = input;
  await db
    .insert(schema.creditPacks)
    .values({ id, ...rest })
    .onConflictDoUpdate({ target: schema.creditPacks.id, set: { ...rest, updatedAt: new Date() } });
}

export async function upsertReelScene(db: Db, input: ReelSceneInput): Promise<void> {
  const { id, ...rest } = input;
  await db
    .insert(schema.reelScenes)
    .values({ id, ...rest })
    .onConflictDoUpdate({ target: schema.reelScenes.id, set: { ...rest, updatedAt: new Date() } });
}

export async function setAppContent(db: Db, key: AppContentKey, value: unknown, updatedBy: string | null): Promise<void> {
  await db
    .insert(schema.appContent)
    .values({ key, value, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.appContent.key, set: { value, updatedBy, updatedAt: new Date() } });
}

export async function deleteBackdrop(db: Db, id: string) {
  await db.delete(schema.backdrops).where(eq(schema.backdrops.id, id));
}
export async function deleteCreditPack(db: Db, id: string) {
  await db.delete(schema.creditPacks).where(eq(schema.creditPacks.id, id));
}
export async function deleteReelScene(db: Db, id: string) {
  await db.delete(schema.reelScenes).where(eq(schema.reelScenes.id, id));
}
export async function setBaseModelActive(db: Db, id: string, active: boolean) {
  await db.update(schema.baseModels).set({ active, updatedAt: new Date() }).where(eq(schema.baseModels.id, id));
}
export async function setBaseModelImage(db: Db, id: string, imageKey: string | null, size?: { width: number; height: number }) {
  await db
    .update(schema.baseModels)
    .set({ imageKey, imageUrl: null, ...(size ?? {}), updatedAt: new Date() })
    .where(eq(schema.baseModels.id, id));
}

/* --------------------------------- seed -------------------------------- */

export const sceneId = (vibe: ReelVibe, index: number) => `${vibe}-${String(index + 1).padStart(2, "0")}`;

export function seedRows() {
  const defaults = defaultContent();
  const baseModels: BaseModelInput[] = defaults.baseModels.map((m, i) => ({
    id: m.id,
    label: m.label,
    bodyType: m.bodyType,
    skinTone: m.skinTone,
    ageRange: m.ageRange,
    pose: m.pose,
    imageKey: null,
    imageUrl: null,
    width: m.width,
    height: m.height,
    licenceNote: m.licenceNote,
    active: m.active,
    sort: i,
  }));
  const backdrops: BackdropInput[] = defaults.backdrops.map((b, i) => ({ ...b, active: true, sort: i }));
  const creditPacks: CreditPackInput[] = defaults.creditPacks.map((p, i) => ({ ...p, active: true, sort: i }));
  const scenes: ReelSceneInput[] = (Object.keys(defaults.scenes) as ReelVibe[]).flatMap((vibe) =>
    defaults.scenes[vibe].map((s, i) => ({ id: sceneId(vibe, i), vibe, label: s.label, shotType: s.shotType, prompt: s.prompt, sort: i, active: true })),
  );
  const appContent = APP_CONTENT_KEYS.map((key) => ({ key, value: APP_CONTENT_DEFAULTS[key] as unknown }));
  return { baseModels, backdrops, creditPacks, scenes, appContent };
}

export type SeedReport = Record<"baseModels" | "backdrops" | "creditPacks" | "reelScenes" | "appContent", number>;

type ContentTable = typeof schema.baseModels | typeof schema.backdrops | typeof schema.creditPacks | typeof schema.reelScenes | typeof schema.appContent;

async function countRows(db: Db, table: ContentTable): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(table);
  return Number(row?.n ?? 0);
}

/**
 * Upsert every default row (`force`) or only fill tables that are empty.
 * `seedContentIfEmpty` runs after migrations at boot so a fresh deploy has
 * content; the explicit script runs it with `force` to restore the defaults.
 * `app_content` is seeded per key, so keys added in a later release appear
 * without touching the keys an admin already edited.
 */
export async function seedContent(db: Db, opts: { force?: boolean; actorId?: string | null } = {}): Promise<SeedReport> {
  const rows = seedRows();
  const report: SeedReport = { baseModels: 0, backdrops: 0, creditPacks: 0, reelScenes: 0, appContent: 0 };

  if (opts.force || (await countRows(db, schema.baseModels)) === 0) {
    for (const m of rows.baseModels) await upsertBaseModel(db, m);
    report.baseModels = rows.baseModels.length;
  }
  if (opts.force || (await countRows(db, schema.backdrops)) === 0) {
    for (const b of rows.backdrops) await upsertBackdrop(db, b);
    report.backdrops = rows.backdrops.length;
  }
  if (opts.force || (await countRows(db, schema.creditPacks)) === 0) {
    for (const p of rows.creditPacks) await upsertCreditPack(db, p);
    report.creditPacks = rows.creditPacks.length;
  }
  if (opts.force || (await countRows(db, schema.reelScenes)) === 0) {
    for (const s of rows.scenes) await upsertReelScene(db, s);
    report.reelScenes = rows.scenes.length;
  }
  const existing = await readAppContent(db);
  for (const { key, value } of rows.appContent) {
    if (!opts.force && existing[key] !== undefined) continue;
    await setAppContent(db, key, value, opts.actorId ?? null);
    report.appContent++;
  }
  return report;
}

export const seedContentIfEmpty = (db: Db) => seedContent(db, { force: false });
