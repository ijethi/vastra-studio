/** Credit price of a run. 25 credits covers two variations; each extra one is 10. Shared by server and client. */
export function creditsForRun(variations: number): number {
  const v = Math.min(4, Math.max(1, variations));
  return v <= 2 ? 25 : 25 + (v - 2) * 10;
}

/** Number of scene stills sketched for a reel. */
export const REEL_STILL_COUNT = 9;
/** How many stills the owner must pick, and may pick, for one reel. */
export const REEL_MIN_SELECTION = 3;
export const REEL_MAX_SELECTION = 6;

/** Flat price for the nine scene stills of a reel, charged when the reel starts. */
export function creditsForReelStills(): number {
  return 60;
}

/** Price of animating one still into a five-second clip, charged per selected still on confirm. */
export function creditsForClip(): number {
  return 40;
}

/** Total clip charge for a selection; the share refunded per failed clip is creditsForClip(). */
export function creditsForClips(count: number): number {
  return Math.max(0, count) * creditsForClip();
}

/** Share of the stills charge refunded for each still that fails the garment gate. */
export function refundPerFailedStill(): number {
  return Math.floor(creditsForReelStills() / REEL_STILL_COUNT);
}
