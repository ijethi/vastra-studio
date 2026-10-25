/**
 * Default credit packs in INR (paise). These seed the `credit_packs` table
 * and are the offline fallback; the live list is edited in the admin console
 * and read through `getCreditPacks()` in src/lib/dal/content.ts.
 */
export const CREDIT_PACKS = [
  { id: "starter", credits: 250, amountMinor: 37_500, label: "Starter", blurb: "About 10 runs" },
  { id: "boutique", credits: 1000, amountMinor: 135_000, label: "Boutique", blurb: "About 40 runs · 10% off" },
  { id: "season", credits: 3000, amountMinor: 360_000, label: "Season", blurb: "About 120 runs · 20% off" },
] as const;

/** Pack ids are data now (admins add packs), so this is any string; the server validates against the live list. */
export type CreditPackId = string;
