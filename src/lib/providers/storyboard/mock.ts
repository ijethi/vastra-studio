import sharp from "sharp";
import type { ReelShotType, ReelVibe } from "@/lib/db/schema";
import { SCENES } from "@/lib/reels/scenes";
import { STILL_HEIGHT, STILL_WIDTH, type StoryboardInput, type StoryboardProvider, type StoryboardStill } from "./types";

/** Colour wash per vibe: blended over the frame with soft light so the garment keeps its colour. */
const WASH: Record<ReelVibe, { colour: string; alpha: number; saturation: number }> = {
  festive: { colour: "#ffb000", alpha: 0.16, saturation: 1.08 },
  everyday: { colour: "#8fb8d8", alpha: 0.1, saturation: 1 },
  editorial: { colour: "#c9c6d1", alpha: 0.14, saturation: 0.86 },
};

/**
 * Offline storyboard: the hero image re-framed per shot type (a wide frame
 * on a blurred backdrop, a full-length crop, a side crop with motion blur,
 * a tight detail crop, a head-and-shoulders crop), a colour wash for the
 * vibe and the scene label in the corner. It makes the flow look real
 * without a model call; the garment pixels are the hero image's own.
 */
export class MockStoryboardProvider implements StoryboardProvider {
  readonly name = "mock";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(input: StoryboardInput): Promise<StoryboardStill[]> {
    const scenes = SCENES[input.vibe].slice(0, Math.max(1, input.count));
    const wash = WASH[input.vibe];
    const hero = sharp(input.heroImage).rotate();
    const meta = await hero.metadata();
    const heroPng = await hero.png().toBuffer();
    const detailRef = input.references?.find((r) => r.kind === "detail");
    const detailPng = detailRef ? await sharp(detailRef.image).rotate().png().toBuffer() : null;
    const detailMeta = detailRef ? await sharp(detailRef.image).rotate().metadata() : null;
    const out: StoryboardStill[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const useDetail = scene.shotType === "detail" && detailPng && detailMeta;
      const framed = useDetail
        ? await reframe(detailPng, detailMeta.width ?? 864, detailMeta.height ?? 1296, "full-body", i)
        : await reframe(heroPng, meta.width ?? 864, meta.height ?? 1296, scene.shotType, i);
      const washLayer = Buffer.from(
        `<svg width="${STILL_WIDTH}" height="${STILL_HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${wash.colour}" fill-opacity="${wash.alpha}"/></svg>`,
      );
      const image = await sharp(framed)
        .modulate({ saturation: wash.saturation })
        .composite([
          { input: washLayer, blend: "soft-light" },
          { input: labelLayer(scene.label, i + 1), top: 0, left: 0 },
        ])
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
      out.push({ image, width: STILL_WIDTH, height: STILL_HEIGHT, sceneLabel: scene.label, shotType: scene.shotType, prompt: scene.prompt, provider: this.name, seed: i, costUsd: 0 });
      await input.onStill?.(i + 1, scenes.length);
    }
    return out;
  }
}

/** Crop or pad the hero image into a 9:16 frame that suits the shot type. */
async function reframe(heroPng: Buffer, w: number, h: number, shotType: ReelShotType, index: number): Promise<Buffer> {
  const crop = (left: number, top: number, width: number, height: number) =>
    sharp(heroPng)
      .extract({ left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) })
      .resize(STILL_WIDTH, STILL_HEIGHT, { fit: "cover" })
      .png()
      .toBuffer();
  // Widest 9:16 window that fits inside the hero.
  const winW = Math.min(w, (h * 9) / 16);
  const winH = (winW * 16) / 9;
  const side = index % 2 === 0 ? 0.42 : 0.58; // alternate which side the window favours
  switch (shotType) {
    case "wide-hook": {
      // The whole hero on a blurred, enlarged copy of itself: a wide, airy opening frame.
      const bg = await sharp(heroPng).resize(STILL_WIDTH, STILL_HEIGHT, { fit: "cover" }).blur(40).modulate({ brightness: 0.8 }).png().toBuffer();
      const fg = await sharp(heroPng).resize(Math.round(STILL_WIDTH * 0.78), Math.round(STILL_HEIGHT * 0.78), { fit: "inside" }).png().toBuffer();
      const fgMeta = await sharp(fg).metadata();
      return sharp(bg)
        .composite([{ input: fg, left: Math.round((STILL_WIDTH - (fgMeta.width ?? 0)) / 2), top: Math.round((STILL_HEIGHT - (fgMeta.height ?? 0)) / 2) }])
        .png()
        .toBuffer();
    }
    case "full-body":
      return crop((w - winW) * side, (h - winH) / 2, winW, winH);
    case "movement": {
      // Slightly tighter window off to one side, so the frame reads as mid-stride.
      const mw = winW * 0.9, mh = winH * 0.9;
      return crop((w - mw) * (1 - side), (h - mh) * 0.55, mw, mh);
    }
    case "detail": {
      // Tight on the torso: waist to chest.
      const dw = winW * 0.55, dh = winH * 0.55;
      return crop((w - dw) / 2, h * 0.3, dw, Math.min(dh, h - h * 0.3));
    }
    case "hero-portrait": {
      // Head and shoulders from the top of the frame.
      const pw = winW * 0.7, ph = winH * 0.7;
      return crop((w - pw) * side, 0, pw, Math.min(ph, h));
    }
  }
}

function labelLayer(label: string, n: number): Buffer {
  const text = `${n} · ${label}`;
  const fontSize = 34;
  const width = text.length * fontSize * 0.56 + 64;
  return Buffer.from(
    `<svg width="${STILL_WIDTH}" height="${STILL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect x="40" y="${STILL_HEIGHT - 150}" width="${width}" height="64" rx="32" fill="#15121e" fill-opacity="0.55"/>
      <text x="72" y="${STILL_HEIGHT - 107}" font-family="'Segoe UI', Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="600" fill="#ffffff">${text.replace(/&/g, "&amp;")}</text>
    </svg>`,
  );
}
