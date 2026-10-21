/** Credit price of a run. 25 credits covers two variations; each extra one is 10. Shared by server and client. */
export function creditsForRun(variations: number): number {
  const v = Math.min(4, Math.max(1, variations));
  return v <= 2 ? 25 : 25 + (v - 2) * 10;
}
