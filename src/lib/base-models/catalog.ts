/**
 * Default base-model library and backdrops. Every entry is an AI-generated,
 * rights-clear image reviewed by a human before it enters the library. No
 * real person's likeness is used. In development the images are placeholder
 * renders made by `pnpm seed:base-models`.
 *
 * These constants seed the `base_models` and `backdrops` tables and remain
 * the offline fallback. The live catalogue is edited in the admin console
 * and read through src/lib/dal/content.ts (`getBaseModels`, `getBackdrops`,
 * `loadBaseModel`, ...). The synchronous `getBaseModel` / `getBackdrop`
 * below only see the defaults; new code should use the DAL.
 */

export type BodyType = "slim" | "regular" | "curvy" | "plus";
export type SkinTone = "fair" | "wheatish" | "dusky" | "deep";
export type AgeRange = "20s" | "30s" | "40s";
export type Pose = "front" | "three-quarter";

export type BaseModel = {
  id: string;
  label: string;
  bodyType: BodyType;
  skinTone: SkinTone;
  ageRange: AgeRange;
  pose: Pose;
  /** Path under /public in dev; a storage key or CDN URL in production. */
  imagePath: string;
  width: number;
  height: number;
  licenceNote: string;
  active: boolean;
};

export type Backdrop = {
  id: string;
  label: string;
  description: string;
  /** Hex colour used for studio backdrops and as the fallback fill. */
  hex: string;
  kind: "studio" | "interior" | "outdoor" | "festive";
};

export const BACKDROPS: Backdrop[] = [
  { id: "studio-ivory", label: "Ivory studio", description: "Soft, warm seamless paper", hex: "#F4EFE6", kind: "studio" },
  { id: "studio-stone", label: "Stone studio", description: "Cool neutral grey", hex: "#D9D6D0", kind: "studio" },
  { id: "studio-charcoal", label: "Charcoal studio", description: "Deep, dramatic backdrop", hex: "#2B2A28", kind: "studio" },
  { id: "boutique-interior", label: "Boutique interior", description: "Blurred rails and warm light", hex: "#E7D9C8", kind: "interior" },
  { id: "street-morning", label: "Morning street", description: "Soft daylight, old city wall", hex: "#CFC3B2", kind: "outdoor" },
  { id: "festive-marigold", label: "Festive", description: "Marigold and brass accents", hex: "#E9B44C", kind: "festive" },
];

export const SKIN_TONES: Record<SkinTone, { label: string; hex: string }> = {
  fair: { label: "Fair", hex: "#F1D2B6" },
  wheatish: { label: "Wheatish", hex: "#D9A77A" },
  dusky: { label: "Dusky", hex: "#A86A3D" },
  deep: { label: "Deep", hex: "#5E3A22" },
};

export const BODY_TYPES: Record<BodyType, string> = {
  slim: "Slim",
  regular: "Regular",
  curvy: "Curvy",
  plus: "Plus",
};

export const AGE_RANGES: Record<AgeRange, string> = { "20s": "20s", "30s": "30s", "40s": "40s" };
export const POSES: Record<Pose, string> = { front: "Front", "three-quarter": "Three-quarter" };

const bodyTypes: BodyType[] = ["slim", "regular", "curvy", "plus"];
const skinTones: SkinTone[] = ["fair", "wheatish", "dusky", "deep"];
const ageRanges: AgeRange[] = ["20s", "30s"];

/** 4 body types x 4 skin tones x 2 age ranges = 32 base models, front pose. */
export const BASE_MODELS: BaseModel[] = bodyTypes.flatMap((bodyType) =>
  skinTones.flatMap((skinTone) =>
    ageRanges.map((ageRange) => {
      const id = `bm-${bodyType}-${skinTone}-${ageRange}`;
      return {
        id,
        label: `${BODY_TYPES[bodyType]} · ${SKIN_TONES[skinTone].label} · ${ageRange}`,
        bodyType,
        skinTone,
        ageRange,
        pose: "front" as const,
        imagePath: `/base-models/${id}.png`,
        width: 864,
        height: 1296,
        licenceNote: "AI-generated, rights-clear, human reviewed",
        active: true,
      };
    }),
  ),
);

export function getBaseModel(id: string): BaseModel | undefined {
  return BASE_MODELS.find((m) => m.id === id && m.active);
}

export function getBackdrop(id: string): Backdrop | undefined {
  return BACKDROPS.find((b) => b.id === id);
}

export const DEFAULT_BASE_MODEL_ID = "bm-regular-wheatish-20s";
export const DEFAULT_BACKDROP_ID = "studio-ivory";
