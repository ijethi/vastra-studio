import sharp from "sharp";
import { BASE_MODELS, type BaseModel } from "@/lib/base-models/catalog";
import { renderBaseModelPng } from "@/lib/base-models/render";
import { placeGarment, softShadow } from "./compose";
import { PERSON_CANVAS, type PersonGenInput, type PersonGenOutput, type PersonGenerator } from "./types";

/**
 * Offline exact-garment generator: the cut-out is scaled to the torso of the
 * placeholder base model and laid over it with a soft shadow. The garment
 * pixels are untouched, so the exact-match check passes by construction.
 */
export class MockPersonGenerator implements PersonGenerator {
  readonly name = "mock";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(input: PersonGenInput): Promise<PersonGenOutput> {
    const { hints } = input;
    const base = input.baseModelImage ?? (await renderBaseModelPng(baseModelFor(hints), hints.backdrop, PERSON_CANVAS.width, PERSON_CANVAS.height));
    const placed = await placeGarment(input.garmentCutout, input.garmentMask, input.category);
    const shadow = await softShadow(placed.canvasMask);
    const image = await sharp(base)
      .rotate()
      .resize(PERSON_CANVAS.width, PERSON_CANVAS.height, { fit: "cover", position: "centre" })
      .composite([
        { input: shadow, left: 0, top: 0 },
        { input: placed.layer, left: 0, top: 0 },
      ])
      .jpeg({ quality: 94, mozjpeg: true })
      .toBuffer();
    return {
      image,
      width: PERSON_CANVAS.width,
      height: PERSON_CANVAS.height,
      placement: placed.placement,
      canvasMask: placed.canvasMask,
      seed: hints.seed,
      provider: this.name,
      costUsd: 0,
    };
  }
}

function baseModelFor(hints: PersonGenInput["hints"]): BaseModel {
  return (
    BASE_MODELS.find((m) => m.bodyType === hints.bodyType && m.skinTone === hints.skinTone && m.ageRange === hints.ageRange) ??
    BASE_MODELS.find((m) => m.bodyType === hints.bodyType && m.skinTone === hints.skinTone) ?? {
      id: "bm-custom",
      label: "Custom",
      bodyType: hints.bodyType,
      skinTone: hints.skinTone,
      ageRange: hints.ageRange,
      pose: "front",
      imagePath: "",
      width: PERSON_CANVAS.width,
      height: PERSON_CANVAS.height,
      licenceNote: "placeholder",
      active: true,
    }
  );
}
