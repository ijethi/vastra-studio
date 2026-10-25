import type { ReelVibe } from "@/lib/db/schema";

/**
 * Editable copy and small configuration blobs stored in `app_content`.
 * Each key has a typed shape; the admin console edits them as JSON and the
 * readers fall back to these defaults when a key is missing or malformed.
 * No server-only import: the shapes are shared with client components.
 */
export type AppContentMap = {
  /** Landing page hero. */
  "landing.hero": {
    eyebrow: string;
    /** One line per entry; the last line is highlighted. */
    lines: string[];
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
    bullets: string[];
  };
  /** Landing page pricing band. */
  "landing.pricing": {
    eyebrow: string;
    heading: string;
    blurb: string;
    cta: string;
  };
  /** Garment types shown on the landing page; `live: false` renders as "coming later". */
  "landing.garments": {
    heading: string;
    note: string;
    items: Array<{ label: string; live: boolean }>;
  };
  /** House defaults applied to a new boutique and used when a setting is missing. */
  "studio.defaults": {
    baseModelId: string;
    backdropId: string;
    variations: number;
  };
  /** Copy on the billing page. */
  "billing.copy": {
    packsHeading: string;
    packsNote: string;
    balanceNote: string;
  };
  /** Reel vibe cards: label, tagline and the mood sentence given to the storyboard model. */
  "reels.vibes": {
    vibes: Array<{ id: ReelVibe; label: string; tagline: string; mood: string }>;
  };
};

export type AppContentKey = keyof AppContentMap;

export const APP_CONTENT_DEFAULTS: AppContentMap = {
  "landing.hero": {
    eyebrow: "For boutiques in India",
    lines: ["Your suit, on a model,", "in a minute."],
    subtitle:
      "Photograph the piece the way you already do, on the hanger or the mannequin. Vastra shows it on a real-looking model with the same colour, embroidery and fall, ready for WhatsApp and Instagram.",
    primaryCta: "Try it with your next piece",
    secondaryCta: "See how it works",
    bullets: ["Free credits to start", "No card needed", "Only pay for photos that pass our check"],
  },
  "landing.pricing": {
    eyebrow: "Pricing",
    heading: "Less than a cup of chai per photo.",
    blurb: "Two versions of a piece cost 25 credits. Packs start at ₹375 for 250 credits, about ten pieces. No monthly fee, credits do not expire, and failed photos are refunded.",
    cta: "Start free, buy later",
  },
  "landing.garments": {
    heading: "Built around what hangs in your shop.",
    note: "Each garment type goes live only after it passes our checks on real pieces from pilot boutiques.",
    items: [
      { label: "Kurta sets", live: true },
      { label: "Anarkalis", live: true },
      { label: "Kaftans", live: true },
      { label: "Co-ord sets", live: true },
      { label: "Lehengas", live: true },
      { label: "Sharara sets", live: true },
      { label: "Western wear", live: true },
      { label: "Sarees", live: false },
    ],
  },
  "studio.defaults": { baseModelId: "bm-regular-wheatish-20s", backdropId: "studio-ivory", variations: 2 },
  "billing.copy": {
    packsHeading: "Credit packs",
    packsNote: "Prices include GST. Credits never expire while your account is active.",
    balanceNote: "credits · a two-image run is 25",
  },
  "reels.vibes": {
    vibes: [
      { id: "everyday", label: "Everyday", tagline: "Chai, commute, a quiet café. Calm light.", mood: "relaxed everyday life, soft natural light, candid and unhurried" },
      { id: "festive", label: "Festive", tagline: "Rickshaw, rooftop, golden hour. Full of life.", mood: "festive Indian celebration, warm golden light, lively and joyful" },
      { id: "editorial", label: "Editorial", tagline: "Studio, marble, clean lines. Magazine calm.", mood: "high-fashion editorial, controlled studio and architectural light, composed and minimal" },
    ],
  },
};

export const APP_CONTENT_DESCRIPTIONS: Record<AppContentKey, string> = {
  "landing.hero": "Landing page hero: eyebrow, headline lines, subtitle, buttons and the three bullets.",
  "landing.pricing": "Landing page pricing band: heading, blurb and button label.",
  "landing.garments": "Garment types listed on the landing page. Items with live=false show as coming later.",
  "studio.defaults": "Default base model, backdrop and number of variations for a new boutique.",
  "billing.copy": "Headings and notes on the billing page.",
  "reels.vibes": "The three reel vibes: label, tagline and the mood sentence sent to the scene model.",
};

export const APP_CONTENT_KEYS = Object.keys(APP_CONTENT_DEFAULTS) as AppContentKey[];

/**
 * Shallow-validates a stored value against the default's shape: every key of
 * the default must exist with the same primitive type (arrays and objects are
 * checked by kind only). Malformed values fall back to the default so a bad
 * edit never breaks a page.
 */
export function coerceAppContent<K extends AppContentKey>(key: K, value: unknown): AppContentMap[K] {
  const fallback = APP_CONTENT_DEFAULTS[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const out: Record<string, unknown> = { ...(fallback as Record<string, unknown>) };
  for (const [k, def] of Object.entries(fallback as Record<string, unknown>)) {
    const v = (value as Record<string, unknown>)[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(def)) {
      if (Array.isArray(v)) out[k] = v;
    } else if (typeof def === "object") {
      if (typeof v === "object" && !Array.isArray(v)) out[k] = v;
    } else if (typeof v === typeof def) {
      out[k] = v;
    }
  }
  return out as AppContentMap[K];
}
