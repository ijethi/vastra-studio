import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { ingestUpload, InvalidImageError, finishOutput, estimateColourCast, normaliseColourCast, checkExactMatch } from "./images";

/** Grey wall and floor with a coloured garment rectangle in the middle. */
async function studioScene(garment = { r: 200, g: 70, b: 90 }) {
  const width = 300, height = 400;
  const box = { left: 90, top: 80, width: 120, height: 240 };
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="rgb(150,150,150)"/>
    <rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="rgb(${garment.r},${garment.g},${garment.b})"/>
  </svg>`;
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  const mask = await sharp(
    Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="black"/><rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="white"/></svg>`),
  )
    .toColourspace("b-w")
    .png()
    .toBuffer();
  return { image, mask, box, width, height };
}

/** Multiply channels to fake warm tungsten light. */
async function warmCast(image: Buffer, gains: [number, number, number] = [1.18, 1.0, 0.8]) {
  return sharp(image).linear([...gains], [0, 0, 0]).png().toBuffer();
}

/** Mean RGB of a region, read from raw pixels (sharp's stats() ignores a preceding extract). */
async function meanRgb(image: Buffer, region?: { left: number; top: number; width: number; height: number }) {
  const s = region ? sharp(image).extract(region) : sharp(image);
  const { data, info } = await s.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sums = [0, 0, 0];
  for (let i = 0; i < data.length; i += info.channels) for (let c = 0; c < 3; c++) sums[c] += data[i + c];
  const n = data.length / info.channels;
  return sums.map((v) => v / n) as [number, number, number];
}

const spread = (rgb: [number, number, number]) => Math.max(...rgb) - Math.min(...rgb);

describe("ingestUpload", () => {
  it("rejects non-image bytes", async () => {
    await assert.rejects(ingestUpload(Buffer.from("definitely not an image")), InvalidImageError);
  });

  it("re-encodes to JPEG, strips metadata and makes a thumbnail", async () => {
    const png = await sharp({ create: { width: 1200, height: 1600, channels: 4, background: { r: 200, g: 50, b: 50, alpha: 1 } } })
      .png()
      .withMetadata({ exif: { IFD0: { Copyright: "secret" } } })
      .toBuffer();
    const out = await ingestUpload(png);
    const meta = await sharp(out.original).metadata();
    assert.equal(meta.format, "jpeg");
    assert.equal(meta.exif, undefined);
    assert.equal(out.width, 1200);
    const thumb = await sharp(out.thumb).metadata();
    assert.ok(Math.max(thumb.width ?? 0, thumb.height ?? 0) <= 480);
  });
});

describe("finishOutput", () => {
  it("embeds a provenance statement and optional watermark", async () => {
    const src = await sharp({ create: { width: 400, height: 600, channels: 3, background: { r: 230, g: 220, b: 200 } } }).jpeg().toBuffer();
    const out = await finishOutput(src, {
      watermarkText: "Test · preview",
      provenance: { generator: "Vastra Studio", provider: "mock", jobId: "job_1", imageId: "img_1", seed: 1, generatedAt: "2026-10-21T00:00:00Z", synthetic: true },
    });
    const meta = await sharp(out.image).metadata();
    assert.ok(meta.exif);
    assert.equal(out.width, 400);
  });
});

describe("colour normalisation", () => {
  it("neutralises a warm cast measured on the background and brings the garment colour back", async () => {
    const scene = await studioScene();
    const warm = await warmCast(scene.image);
    const cast = await estimateColourCast(warm, scene.mask);
    assert.equal(cast.source, "background");
    assert.ok(cast.gains[0] < 1 && cast.gains[2] > 1, `gains ${cast.gains}`);
    const fixed = await normaliseColourCast(warm, cast);

    const wallBefore = await meanRgb(warm, { left: 0, top: 0, width: 80, height: 60 });
    const wallAfter = await meanRgb(fixed, { left: 0, top: 0, width: 80, height: 60 });
    assert.ok(spread(wallAfter) < spread(wallBefore) * 0.5, `wall spread ${spread(wallBefore)} -> ${spread(wallAfter)}`);

    const original = await meanRgb(scene.image, scene.box);
    const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const garmentBefore = await meanRgb(warm, scene.box);
    const garmentAfter = await meanRgb(fixed, scene.box);
    assert.ok(dist(garmentAfter, original) < dist(garmentBefore, original) * 0.6, `garment distance ${dist(garmentBefore, original)} -> ${dist(garmentAfter, original)}`);
  });

  it("is conservative: never fully removes the cast and clamps extreme gains", async () => {
    const scene = await studioScene();
    const warm = await warmCast(scene.image, [1.6, 1.0, 0.5]);
    const cast = await estimateColourCast(warm, scene.mask);
    assert.ok(cast.gains.every((g) => g >= 0.86 && g <= 1.18), `gains ${cast.gains}`);
    const fixed = await normaliseColourCast(warm, cast);
    const wall = await meanRgb(fixed, { left: 0, top: 0, width: 80, height: 60 });
    assert.ok(spread(wall) > 5, "a strong cast is only partly corrected");
  });

  it("leaves a neutral photo untouched", async () => {
    const scene = await studioScene();
    const cast = await estimateColourCast(scene.image, scene.mask);
    assert.ok(cast.magnitude < 0.015, `magnitude ${cast.magnitude}`);
    const out = await normaliseColourCast(scene.image, cast);
    assert.equal(out, scene.image);
  });

  it("falls back to the whole image when the mask covers nearly everything", async () => {
    const scene = await studioScene();
    const everything = await sharp({ create: { width: scene.width, height: scene.height, channels: 3, background: "#fff" } }).toColourspace("b-w").png().toBuffer();
    const cast = await estimateColourCast(await warmCast(scene.image), everything);
    assert.equal(cast.source, "image");
  });
});

describe("checkExactMatch", () => {
  async function placedCase() {
    const canvas = { width: 300, height: 450 };
    const placement = { left: 90, top: 100, width: 120, height: 240 };
    // Garment layer: a striped red rectangle with alpha; a plain grey backdrop underneath.
    const stripes = Array.from({ length: 12 }, (_, i) => `<rect x="${placement.left}" y="${placement.top + i * 20}" width="${placement.width}" height="10" fill="rgb(150,40,60)"/>`).join("");
    const garmentSvg = `<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg"><rect x="${placement.left}" y="${placement.top}" width="${placement.width}" height="${placement.height}" fill="rgb(200,70,90)"/>${stripes}</svg>`;
    const garmentLayer = await sharp(Buffer.from(garmentSvg)).ensureAlpha().png().toBuffer();
    const canvasMask = await sharp(
      Buffer.from(`<svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="black"/><rect x="${placement.left}" y="${placement.top}" width="${placement.width}" height="${placement.height}" fill="white"/></svg>`),
    )
      .toColourspace("b-w")
      .png()
      .toBuffer();
    const backdrop = sharp({ create: { ...canvas, channels: 3, background: "#d9d6d0" } });
    const good = await backdrop.clone().composite([{ input: garmentLayer }]).jpeg({ quality: 94 }).toBuffer();
    return { canvas, placement, garmentLayer, canvasMask, good, backdrop };
  }

  it("passes when the garment pixels were kept and fails when colour or detail changed", async () => {
    const c = await placedCase();
    const ok = await checkExactMatch({ mode: "placed", output: c.good, garmentLayer: c.garmentLayer, canvasMask: c.canvasMask, placement: c.placement });
    assert.equal(ok.pass, true, ok.reasons.join("; "));
    assert.ok(ok.meanDeltaE < 2 && (ok.ssim ?? 0) > 0.9);

    const recoloured = await sharp(c.good).modulate({ hue: 40 }).jpeg().toBuffer();
    const drift = await checkExactMatch({ mode: "placed", output: recoloured, garmentLayer: c.garmentLayer, canvasMask: c.canvasMask, placement: c.placement });
    assert.equal(drift.pass, false);
    assert.equal(drift.reasons[0], "garment changed");

    // Same colours, stripes smoothed away: the structure check catches a redrawn motif.
    const plain = await c.backdrop
      .clone()
      .composite([
        {
          input: Buffer.from(
            `<svg width="${c.canvas.width}" height="${c.canvas.height}" xmlns="http://www.w3.org/2000/svg"><rect x="${c.placement.left}" y="${c.placement.top}" width="${c.placement.width}" height="${c.placement.height}" fill="rgb(175,55,75)"/></svg>`,
          ),
        },
      ])
      .jpeg()
      .toBuffer();
    const smoothed = await checkExactMatch({ mode: "placed", output: plain, garmentLayer: c.garmentLayer, canvasMask: c.canvasMask, placement: c.placement });
    assert.equal(smoothed.pass, false);
    assert.ok(smoothed.reasons.some((r) => r.startsWith("details changed")), smoothed.reasons.join("; "));
  });

  it("in search mode accepts an output that shows the garment colours and rejects a different colour", async () => {
    const scene = await studioScene({ r: 200, g: 70, b: 90 });
    const cutout = await sharp(scene.image).ensureAlpha().composite([{ input: scene.mask, blend: "dest-in" }]).png().toBuffer();
    const sameColour = await sharp(Buffer.from(`<svg width="400" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="rgb(230,225,215)"/><rect x="120" y="150" width="160" height="300" fill="rgb(196,74,92)"/></svg>`)).jpeg().toBuffer();
    const ok = await checkExactMatch({ mode: "search", output: sameColour, cutout, mask: scene.mask });
    assert.equal(ok.pass, true, ok.reasons.join("; "));
    assert.ok((ok.matchedFraction ?? 0) > 0.1);

    const blue = await sharp(Buffer.from(`<svg width="400" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="rgb(230,225,215)"/><rect x="120" y="150" width="160" height="300" fill="rgb(70,90,200)"/></svg>`)).jpeg().toBuffer();
    const bad = await checkExactMatch({ mode: "search", output: blue, cutout, mask: scene.mask });
    assert.equal(bad.pass, false);
    assert.equal(bad.reasons[0], "garment changed");
  });
});
