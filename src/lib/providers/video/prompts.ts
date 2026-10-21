import type { GarmentAnalysis, ReelShotType, ReelVibe } from "@/lib/db/schema";
import { vibeInfo } from "@/lib/reels/scenes";

/** From the guide: what the clip must never contain. */
export const NEGATIVE_PROMPT = "blurry, distorted hands, extra fingers, morphing, low resolution, cartoonish";

/** The guide's formula per shot type: camera movement + action, the garment and light are added around it. */
const TEMPLATES: Record<ReelShotType, { camera: string; action: string }> = {
  "wide-hook": { camera: "slow cinematic push-in from a wide frame", action: "she looks up towards the camera and smiles softly" },
  "full-body": { camera: "gentle dolly forward, camera steady at chest height", action: "she shifts her weight and turns slightly so the whole outfit is seen" },
  movement: { camera: "smooth tracking shot that follows her", action: "she walks a few steps towards the camera, fabric swaying naturally" },
  detail: { camera: "slow tilt up from the hem along the fabric", action: "the fabric moves softly in a light breeze, embroidery catching the light" },
  "hero-portrait": { camera: "subtle slow orbit around her", action: "she turns her head towards the light and holds a calm expression" },
};

const SAFETY = "keep full body in frame, hem visible throughout, garment colour, print and embroidery unchanged, natural hands";

export function describeGarment(analysis: GarmentAnalysis | null, title: string): string {
  if (!analysis) return title || "the garment";
  const bits = [analysis.colour, analysis.print ? `${analysis.print} print` : null, analysis.fabricGuess, analysis.title || title].filter(Boolean);
  return bits.join(" ");
}

/** Motion prompt for one clip. */
export function motionPrompt(args: { shotType: ReelShotType; analysis: GarmentAnalysis | null; title: string; vibe: ReelVibe; sceneLabel: string }): string {
  const t = TEMPLATES[args.shotType];
  const mood = vibeInfo(args.vibe).mood;
  return [
    `An Indian woman wearing ${describeGarment(args.analysis, args.title)}, ${args.sceneLabel.toLowerCase()}.`,
    `Camera: ${t.camera}.`,
    `Action: ${t.action}.`,
    `Lighting and mood: ${mood}.`,
    "Style: photoreal fashion reel, 9:16 vertical, five seconds, subtle motion.",
    SAFETY + ".",
  ].join(" ");
}
