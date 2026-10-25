import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/lib/db";
import type { BaseModelRow, ReelVibe } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";
import { createMemo } from "@/lib/content/memo";
import {
  appContentValue,
  baseModelFromRow,
  defaultContent,
  readAppContent,
  readBackdrops,
  readBaseModelRows,
  readCreditPacks,
  readReelScenes,
  type CreditPack,
} from "@/lib/content/store";
import type { AppContentKey, AppContentMap } from "@/lib/content/types";
import type { Backdrop, BaseModel } from "@/lib/base-models/catalog";
import type { Scene } from "@/lib/reels/scenes";

export type { Backdrop, BaseModel, CreditPack, Scene };

/**
 * Content readers. Two layers:
 *
 *  - `load*`: read the database (falling back to the typed defaults when a
 *    table is empty or unreachable), memoised in-process for a short time.
 *    Safe anywhere: the worker, server actions, route handlers, scripts.
 *  - `get*`: the same reads wrapped in `use cache` for the request path.
 *    Next.js caches the result per build and revalidates it after a minute
 *    or on demand when the admin console calls `updateTag("content")`.
 *    Only call these from pages, layouts, server actions and route handlers:
 *    `use cache` throws outside the App Router (for example in the worker).
 *
 * The admin console reads rows straight from the store so edits are visible
 * immediately regardless of either cache.
 */

export const CONTENT_TAG = "content";
const MEMO_TTL_MS = 30_000;
/** Previews are signed for a day; the request cache expires within the hour. */
const PREVIEW_URL_TTL_SECONDS = 24 * 60 * 60;

function warn(what: string, err: unknown) {
  console.warn(`[content] ${what} unavailable, using the built-in defaults:`, err instanceof Error ? err.message : err);
}

/** Preview image for a base model: the uploaded render in storage, an external URL, or the development placeholder. */
function previewUrlFor(row: BaseModelRow, sign: (key: string) => string): string {
  if (row.imageUrl) return row.imageUrl;
  if (row.imageKey) return sign(row.imageKey);
  return `/base-models/${row.id}.png`;
}

async function loadBaseModelsFromDb(): Promise<BaseModel[]> {
  const db = await getDb();
  const rows = await readBaseModelRows(db);
  // Sign every uploaded preview in one batch rather than one presign per row.
  const keys = rows.map((r) => r.imageKey).filter((k): k is string => Boolean(k));
  const urls = keys.length ? await getStorage().signReadMany(keys, PREVIEW_URL_TTL_SECONDS) : new Map<string, string>();
  return rows
    .map((r) => baseModelFromRow(r, (row) => previewUrlFor(row, (key) => urls.get(key) ?? `/base-models/${row.id}.png`)))
    .filter((m): m is BaseModel => m !== null);
}

const baseModelsMemo = createMemo<BaseModel[]>(async () => {
  try {
    const rows = await loadBaseModelsFromDb();
    return rows.length ? rows : defaultContent().baseModels;
  } catch (err) {
    warn("base models", err);
    return defaultContent().baseModels;
  }
}, MEMO_TTL_MS);

const backdropsMemo = createMemo<Backdrop[]>(async () => {
  try {
    const rows = await readBackdrops(await getDb());
    return rows.length ? rows : defaultContent().backdrops;
  } catch (err) {
    warn("backdrops", err);
    return defaultContent().backdrops;
  }
}, MEMO_TTL_MS);

const creditPacksMemo = createMemo<CreditPack[]>(async () => {
  try {
    const rows = await readCreditPacks(await getDb());
    return rows.length ? rows : defaultContent().creditPacks;
  } catch (err) {
    warn("credit packs", err);
    return defaultContent().creditPacks;
  }
}, MEMO_TTL_MS);

const scenesMemo = createMemo<Record<ReelVibe, Scene[]>>(async () => {
  const defaults = defaultContent().scenes;
  try {
    const rows = await readReelScenes(await getDb());
    // A vibe with no active scenes keeps its defaults so a reel can always be made.
    return {
      everyday: rows.everyday.length ? rows.everyday : defaults.everyday,
      festive: rows.festive.length ? rows.festive : defaults.festive,
      editorial: rows.editorial.length ? rows.editorial : defaults.editorial,
    };
  } catch (err) {
    warn("reel scenes", err);
    return defaults;
  }
}, MEMO_TTL_MS);

const appContentMemo = createMemo<Partial<Record<AppContentKey, unknown>>>(async () => {
  try {
    return await readAppContent(await getDb());
  } catch (err) {
    warn("app content", err);
    return {};
  }
}, MEMO_TTL_MS);

/* ------------------------------ raw loaders ---------------------------- */

export const loadBaseModels = (opts?: { fresh?: boolean }) => baseModelsMemo.get(opts);
export const loadBackdrops = (opts?: { fresh?: boolean }) => backdropsMemo.get(opts);
export const loadCreditPacks = (opts?: { fresh?: boolean }) => creditPacksMemo.get(opts);
export const loadReelScenesByVibe = (opts?: { fresh?: boolean }) => scenesMemo.get(opts);

export async function loadBaseModel(id: string): Promise<BaseModel | undefined> {
  return (await loadBaseModels()).find((m) => m.id === id);
}

export async function loadBackdrop(id: string): Promise<Backdrop | undefined> {
  return (await loadBackdrops()).find((b) => b.id === id);
}

export async function loadReelScenes(vibe: ReelVibe): Promise<Scene[]> {
  return (await loadReelScenesByVibe())[vibe];
}

export async function loadAppContent<K extends AppContentKey>(key: K): Promise<AppContentMap[K]> {
  return appContentValue(await appContentMemo.get(), key);
}

/** Drop the in-process memo (the admin console calls this after every edit; other instances expire within `MEMO_TTL_MS`). */
export function invalidateContentMemo(): void {
  baseModelsMemo.invalidate();
  backdropsMemo.invalidate();
  creditPacksMemo.invalidate();
  scenesMemo.invalidate();
  appContentMemo.invalidate();
}

/* ------------------------- request-path (use cache) -------------------- */

const LIFE = { stale: 60, revalidate: 60, expire: 60 * 60 } as const;

export async function getBaseModels(): Promise<BaseModel[]> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife(LIFE);
  return loadBaseModels();
}

export async function getActiveBaseModels(): Promise<BaseModel[]> {
  return (await getBaseModels()).filter((m) => m.active);
}

export async function getBaseModel(id: string): Promise<BaseModel | undefined> {
  return (await getBaseModels()).find((m) => m.id === id && m.active);
}

export async function getBackdrops(): Promise<Backdrop[]> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife(LIFE);
  return loadBackdrops();
}

export async function getBackdrop(id: string): Promise<Backdrop | undefined> {
  return (await getBackdrops()).find((b) => b.id === id);
}

export async function getCreditPacks(): Promise<CreditPack[]> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife(LIFE);
  return loadCreditPacks();
}

export async function getCreditPack(id: string): Promise<CreditPack | undefined> {
  return (await getCreditPacks()).find((p) => p.id === id);
}

export async function getReelScenes(vibe: ReelVibe): Promise<Scene[]> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife(LIFE);
  return loadReelScenes(vibe);
}

export async function getAppContent<K extends AppContentKey>(key: K): Promise<AppContentMap[K]> {
  "use cache";
  cacheTag(CONTENT_TAG);
  cacheLife(LIFE);
  return loadAppContent(key);
}

/** House defaults for a new boutique, validated against the live catalogue. */
export async function getStudioDefaults(): Promise<{ baseModelId: string; backdropId: string; variations: number }> {
  const [wanted, models, backdrops] = await Promise.all([getAppContent("studio.defaults"), getActiveBaseModels(), getBackdrops()]);
  return resolveStudioDefaults(wanted, models, backdrops);
}

/** Same as `getStudioDefaults` without `use cache`, for code that runs outside a request. */
export async function loadStudioDefaults(): Promise<{ baseModelId: string; backdropId: string; variations: number }> {
  const [wanted, models, backdrops] = await Promise.all([loadAppContent("studio.defaults"), loadBaseModels(), loadBackdrops()]);
  return resolveStudioDefaults(wanted, models.filter((m) => m.active), backdrops);
}

function resolveStudioDefaults(wanted: AppContentMap["studio.defaults"], models: BaseModel[], backdrops: Backdrop[]) {
  const baseModelId = models.some((m) => m.id === wanted.baseModelId) ? wanted.baseModelId : (models[0]?.id ?? wanted.baseModelId);
  const backdropId = backdrops.some((b) => b.id === wanted.backdropId) ? wanted.backdropId : (backdrops[0]?.id ?? wanted.backdropId);
  const variations = Math.min(4, Math.max(1, Math.round(Number(wanted.variations) || 2)));
  return { baseModelId, backdropId, variations };
}
