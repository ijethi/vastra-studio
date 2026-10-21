/** Credit packs in INR (paise). Final prices are fixed at the pilot gate. */
export const CREDIT_PACKS = [
  { id: "starter", credits: 250, amountMinor: 37_500, label: "Starter", blurb: "About 10 runs" },
  { id: "boutique", credits: 1000, amountMinor: 135_000, label: "Boutique", blurb: "About 40 runs · 10% off" },
  { id: "season", credits: 3000, amountMinor: 360_000, label: "Season", blurb: "About 120 runs · 20% off" },
] as const;

export type CreditPackId = (typeof CREDIT_PACKS)[number]["id"];
