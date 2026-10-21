import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { HeuristicSegmenter } from "./heuristic";
import { ImglySegmenter } from "./imgly";
import { MockSegmenter } from "./mock";
import { applyMask, garmentOnNeutralCanvas, maskPixels, refineGarmentMask, toWorkingRgb } from "./mask";

/**
 * A shop-like scene: cluttered multicoloured background, a red "garment"
 * rectangle in the middle, a white mannequin neck stub above it and a grey
 * stand pole below it.
 */
async function shopScene(width = 480, height = 800) {
  const blocks: string[] = [];
  const colours = ["#2A5BD7", "#3C9D4E", "#8E8E8E", "#C8A24B", "#5A3E85", "#1F1F1F", "#E0D7C6"];
  let k = 0;
  for (let y = 0; y < height; y += 80) {
    for (let x = 0; x < width; x += 60) {
      blocks.push(`<rect x="${x}" y="${y}" width="60" height="80" fill="${colours[k++ % colours.length]}"/>`);
    }
  }
  const garment = { left: Math.round(width * 0.25), top: Math.round(height * 0.2), width: Math.round(width * 0.5), height: Math.round(height * 0.6) };
  const neck = { left: Math.round(width * 0.44), top: Math.round(height * 0.1), width: Math.round(width * 0.12), height: Math.round(height * 0.1) + 2 };
  const pole = { left: Math.round(width * 0.48), top: garment.top + garment.height - 2, width: Math.round(width * 0.04), height: Math.round(height * 0.15) };
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${blocks.join("")}
    <rect x="${neck.left}" y="${neck.top}" width="${neck.width}" height="${neck.height}" fill="#F2F2F2"/>
    <rect x="${pole.left}" y="${pole.top}" width="${pole.width}" height="${pole.height}" fill="#6B6B6B"/>
    <rect x="${garment.left}" y="${garment.top}" width="${garment.width}" height="${garment.height}" fill="#C8323C"/>
  </svg>`;
  const image = await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
  return { image, width, height, garment, neck, pole };
}

function coverage(mask: Uint8Array, width: number, box: { left: number; top: number; width: number; height: number }, inset = 4) {
  let sum = 0, n = 0;
  for (let y = box.top + inset; y < box.top + box.height - inset; y++) {
    for (let x = box.left + inset; x < box.left + box.width - inset; x++) {
      sum += mask[y * width + x];
      n++;
    }
  }
  return n ? sum / 255 / n : 0;
}

describe("MockSegmenter", () => {
  it("returns a soft central mask the size of the input", async () => {
    const scene = await shopScene();
    const result = await new MockSegmenter().segment(scene.image);
    const meta = await sharp(result.mask).metadata();
    assert.equal(meta.width, scene.width);
    assert.equal(meta.height, scene.height);
    assert.ok(result.coverage > 0.3 && result.coverage < 0.6, `coverage ${result.coverage}`);
    assert.ok(result.bbox.left > 0 && result.bbox.left + result.bbox.width < scene.width);
  });
});

describe("HeuristicSegmenter", () => {
  it("finds a coloured garment on a cluttered background and drops the neck and stand", async () => {
    const scene = await shopScene();
    const result = await new HeuristicSegmenter().segment(scene.image);
    const mask = await maskPixels(result.mask, scene.width, scene.height);
    assert.ok(coverage(mask, scene.width, scene.garment) > 0.9, "garment should be inside the mask");
    assert.ok(coverage(mask, scene.width, scene.neck, 2) < 0.2, "white neck stub should be trimmed");
    assert.ok(coverage(mask, scene.width, { left: scene.pole.left, top: scene.pole.top + 10, width: scene.pole.width, height: scene.pole.height - 10 }, 1) < 0.25, "stand should be trimmed");
    const outside = coverage(mask, scene.width, { left: 0, top: 0, width: scene.width, height: Math.round(scene.height * 0.08) }, 0);
    assert.ok(outside < 0.05, "top band of background should be outside the mask");
    assert.ok(Math.abs(result.bbox.top - scene.garment.top) < scene.height * 0.03, `bbox top ${result.bbox.top} vs ${scene.garment.top}`);
  });
});

describe("refineGarmentMask", () => {
  it("keeps the largest blob and removes neutral stubs for a coloured garment", async () => {
    const scene = await shopScene();
    const work = await toWorkingRgb(scene.image);
    const scale = work.width / scene.width;
    const fg = new Uint8Array(work.width * work.height);
    const fill = (b: { left: number; top: number; width: number; height: number }) => {
      for (let y = Math.round(b.top * scale); y < Math.round((b.top + b.height) * scale); y++)
        for (let x = Math.round(b.left * scale); x < Math.round((b.left + b.width) * scale); x++) fg[y * work.width + x] = 255;
    };
    fill(scene.garment);
    fill(scene.neck);
    fill(scene.pole);
    // A stray background blob far from the garment.
    fill({ left: 10, top: 10, width: 30, height: 30 });
    const { mask, trimmedNeutral } = refineGarmentMask(work, fg);
    assert.equal(trimmedNeutral, true);
    assert.ok(coverage(mask, work.width, { left: Math.round(10 * scale), top: Math.round(10 * scale), width: Math.round(30 * scale), height: Math.round(30 * scale) }, 0) < 0.01, "stray blob removed");
    assert.ok(coverage(mask, work.width, { left: Math.round(scene.neck.left * scale), top: Math.round(scene.neck.top * scale), width: Math.round(scene.neck.width * scale), height: Math.round(scene.neck.height * scale) }, 1) < 0.1, "neck removed");
    assert.ok(coverage(mask, work.width, { left: Math.round(scene.garment.left * scale), top: Math.round(scene.garment.top * scale), width: Math.round(scene.garment.width * scale), height: Math.round(scene.garment.height * scale) }, 3) > 0.95, "garment kept");
  });
});

describe("cut-out helpers", () => {
  it("applyMask writes the mask into the alpha channel and the neutral canvas crops to the garment", async () => {
    const scene = await shopScene();
    const result = await new HeuristicSegmenter().segment(scene.image);
    const cutout = await applyMask(scene.image, result.mask);
    const meta = await sharp(cutout).metadata();
    assert.equal(meta.channels, 4);
    assert.equal(meta.hasAlpha, true);
    const alpha = await sharp(cutout).extractChannel(3).raw().toBuffer();
    const mask = await maskPixels(result.mask, scene.width, scene.height);
    let diff = 0;
    for (let i = 0; i < alpha.length; i++) diff += Math.abs(alpha[i] - mask[i]);
    assert.ok(diff / alpha.length < 2, "alpha should equal the mask");

    const card = await garmentOnNeutralCanvas(cutout, result.bbox);
    const cardMeta = await sharp(card).metadata();
    assert.ok((cardMeta.width ?? 0) < scene.width && (cardMeta.height ?? 0) < scene.height);
    // Raw pixels, not stats(): stats ignores a preceding extract.
    const corner = await sharp(card).extract({ left: 0, top: 0, width: 4, height: 4 }).removeAlpha().raw().toBuffer();
    assert.ok(corner.every((v) => v > 215), `card corners should be the neutral background, got ${Array.from(corner.subarray(0, 3))}`);
  });
});

describe("ImglySegmenter", () => {
  it("cuts the coral kurta out of the real shop photo", async (t) => {
    const seg = new ImglySegmenter();
    if (!(await seg.isAvailable())) return t.skip("background-removal model not available on this machine");
    const image = await fs.readFile(path.resolve("public/samples/real-mannequin-coral-kurta.webp"));
    const result = await seg.segment(image);
    assert.equal(result.segmenter, "imgly");
    assert.ok(result.coverage > 0.35 && result.coverage < 0.7, `coverage ${result.coverage}`);
    // The mannequin's neck and the shop background above the shoulders are outside the mask.
    assert.ok(result.bbox.top > result.height * 0.05, `bbox top ${result.bbox.top}`);
    const mask = await maskPixels(result.mask, result.width, result.height);
    const neckBand = coverage(mask, result.width, { left: Math.round(result.width * 0.4), top: 0, width: Math.round(result.width * 0.2), height: Math.round(result.height * 0.07) }, 0);
    assert.ok(neckBand < 0.1, `neck band coverage ${neckBand}`);
    // The embroidered chest area stays in.
    const chest = coverage(mask, result.width, { left: Math.round(result.width * 0.3), top: Math.round(result.height * 0.15), width: Math.round(result.width * 0.4), height: Math.round(result.height * 0.3) }, 0);
    assert.ok(chest > 0.95, `chest coverage ${chest}`);
  });
});
