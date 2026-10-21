import type { ReelShotType } from "@/lib/db/schema";
import { REEL_MAX_SELECTION, REEL_MIN_SELECTION } from "@/lib/dal/pricing";

/**
 * The reel's story arc: open wide so the viewer sees the whole look, show the
 * full silhouette, bring it to life, go close on the fabric, finish on a face.
 * Shared by the server (ordering on confirm) and the flow page (preselection).
 */
export const ARC_ORDER: ReelShotType[] = ["wide-hook", "full-body", "movement", "detail", "hero-portrait"];

export type ArcStill = { id: string; shotType: ReelShotType; orderIndex: number };

const rank = (t: ReelShotType) => {
  const i = ARC_ORDER.indexOf(t);
  return i === -1 ? ARC_ORDER.length : i;
};

/** Stable playback order: by arc position, then by the order the stills were sketched. */
export function orderForArc<T extends ArcStill>(stills: T[]): T[] {
  return [...stills].sort((a, b) => rank(a.shotType) - rank(b.shotType) || a.orderIndex - b.orderIndex);
}

/**
 * Suggested selection: one still per arc position when available, then the
 * earliest remaining ones, up to `count`. Returned in playback order.
 */
export function suggestArc<T extends ArcStill>(stills: T[], count = 5): T[] {
  const max = Math.min(REEL_MAX_SELECTION, Math.max(1, count), stills.length);
  const chosen: T[] = [];
  const used = new Set<string>();
  for (const type of ARC_ORDER) {
    if (chosen.length >= max) break;
    const next = stills.filter((s) => s.shotType === type && !used.has(s.id)).sort((a, b) => a.orderIndex - b.orderIndex)[0];
    if (next) {
      chosen.push(next);
      used.add(next.id);
    }
  }
  for (const s of [...stills].sort((a, b) => a.orderIndex - b.orderIndex)) {
    if (chosen.length >= max) break;
    if (!used.has(s.id)) {
      chosen.push(s);
      used.add(s.id);
    }
  }
  return orderForArc(chosen);
}

/** The smallest selection allowed: three, or every still when fewer than three passed the gate. */
export function minSelection(available: number): number {
  return Math.max(1, Math.min(REEL_MIN_SELECTION, available));
}

export function selectionIsValid(selected: string[], available: ArcStill[]): boolean {
  const ids = new Set(available.map((s) => s.id));
  if (selected.length < minSelection(available.length) || selected.length > REEL_MAX_SELECTION) return false;
  if (new Set(selected).size !== selected.length) return false;
  return selected.every((id) => ids.has(id));
}
