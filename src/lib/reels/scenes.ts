import type { ReelShotType, ReelVibe } from "@/lib/db/schema";

/** No server-only import: the flow page shows vibes and scene labels in the browser. */

export type Scene = {
  label: string;
  shotType: ReelShotType;
  /** Scene description handed to the storyboard model, after the garment description. */
  prompt: string;
};

export type VibeInfo = {
  id: ReelVibe;
  label: string;
  tagline: string;
  /** Short description of the mood for the storyboard prompt. */
  mood: string;
};

export const VIBES: VibeInfo[] = [
  { id: "everyday", label: "Everyday", tagline: "Chai, commute, a quiet café. Calm light.", mood: "relaxed everyday life, soft natural light, candid and unhurried" },
  { id: "festive", label: "Festive", tagline: "Rickshaw, rooftop, golden hour. Full of life.", mood: "festive Indian celebration, warm golden light, lively and joyful" },
  { id: "editorial", label: "Editorial", tagline: "Studio, marble, clean lines. Magazine calm.", mood: "high-fashion editorial, controlled studio and architectural light, composed and minimal" },
];

export const vibeInfo = (id: ReelVibe): VibeInfo => VIBES.find((v) => v.id === id) ?? VIBES[0];

/** Nine scenes per vibe. Nine is the grid; the owner keeps three to six. */
export const SCENES: Record<ReelVibe, Scene[]> = {
  festive: [
    { label: "Chai at home", shotType: "wide-hook", prompt: "at home on a cushioned window seat holding a cup of chai, marigold strings behind her, warm morning light" },
    { label: "Stepping out of a rickshaw", shotType: "movement", prompt: "stepping out of a green and yellow auto rickshaw on a busy Indian street, mid-step, golden afternoon light" },
    { label: "Rooftop golden hour", shotType: "full-body", prompt: "standing on a city rooftop at golden hour, water tanks and distant skyline behind, warm backlight on the fabric" },
    { label: "Market walk", shotType: "movement", prompt: "walking through a bustling bazaar lane with bangle stalls and fairy lights, looking over her shoulder" },
    { label: "Window-light portrait", shotType: "hero-portrait", prompt: "three-quarter portrait by a carved wooden window, soft directional daylight, calm expression" },
    { label: "Fabric close-up", shotType: "detail", prompt: "close-up of the garment's fabric, embroidery and border held between her fingers, shallow depth of field" },
    { label: "Full body on stairs", shotType: "full-body", prompt: "full-length on a haveli staircase with painted walls, one hand on the railing, hem and feet visible" },
    { label: "Candid smile", shotType: "hero-portrait", prompt: "laughing candidly at something off camera under festive string lights at dusk" },
    { label: "Mirror moment", shotType: "wide-hook", prompt: "adjusting an earring in an antique full-length mirror, her reflection showing the whole outfit, warm lamp light" },
  ],
  everyday: [
    { label: "Balcony chai", shotType: "wide-hook", prompt: "on a plant-filled apartment balcony holding a cup of chai, soft overcast morning light" },
    { label: "Walking to the metro", shotType: "movement", prompt: "walking along a tree-lined pavement towards a metro station with a tote bag, mid-stride" },
    { label: "Café window seat", shotType: "hero-portrait", prompt: "seated by a café window with a coffee, looking out, soft window light on her face" },
    { label: "Bookshop browse", shotType: "full-body", prompt: "full-length in a small bookshop aisle reaching for a book, warm tungsten light" },
    { label: "Park bench", shotType: "wide-hook", prompt: "sitting relaxed on a park bench under dappled tree shade, wide frame" },
    { label: "Fabric and buttons", shotType: "detail", prompt: "close-up of the garment's fabric, neckline and fastenings, soft daylight, shallow depth of field" },
    { label: "Stairwell", shotType: "full-body", prompt: "full-length on a bright whitewashed stairwell with a skylight, one foot on the step above" },
    { label: "Laughing with a friend", shotType: "hero-portrait", prompt: "laughing mid-conversation with a friend just out of frame, natural daylight" },
    { label: "Doorway light", shotType: "movement", prompt: "stepping through a sunlit doorway into the street, slight motion, hem swinging" },
  ],
  editorial: [
    { label: "Studio wide", shotType: "wide-hook", prompt: "wide frame on a seamless grey studio backdrop, single soft key light, composed stance" },
    { label: "Slow turn on marble", shotType: "movement", prompt: "mid-turn on a polished marble floor, fabric catching the motion, minimal architecture behind" },
    { label: "Profile on concrete", shotType: "hero-portrait", prompt: "profile portrait against raw concrete, hard side light, calm expression" },
    { label: "Drape and fall", shotType: "detail", prompt: "close-up of how the fabric drapes and falls from the waist to the hem, sculptural light" },
    { label: "Gallery stairs", shotType: "full-body", prompt: "full-length on wide gallery steps, symmetrical framing, cool daylight" },
    { label: "Blind shadows", shotType: "hero-portrait", prompt: "portrait with venetian-blind shadows across the wall and fabric, cinematic contrast" },
    { label: "Colonnade stride", shotType: "movement", prompt: "striding down a stone colonnade towards the camera, long shadows" },
    { label: "Texture macro", shotType: "detail", prompt: "macro of the weave, print or embroidery texture, raking light" },
    { label: "Seated on a plinth", shotType: "full-body", prompt: "seated on a low plinth in an empty gallery, full outfit visible, soft top light" },
  ],
};

export const SHOT_TYPE_LABELS: Record<ReelShotType, string> = {
  "wide-hook": "Wide hook",
  "full-body": "Full body",
  movement: "Movement",
  detail: "Detail",
  "hero-portrait": "Hero portrait",
};
