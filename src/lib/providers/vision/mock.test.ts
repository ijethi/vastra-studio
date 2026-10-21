import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { MockVisionProvider } from "./mock";

async function solid(width: number, height: number, rgb: { r: number; g: number; b: number }) {
  return sharp({ create: { width, height, channels: 3, background: rgb } }).jpeg().toBuffer();
}

describe("MockVisionProvider", () => {
  const vision = new MockVisionProvider();

  it("flags tiny and very dark photos as unusable", async () => {
    const dark = await solid(200, 200, { r: 5, g: 5, b: 5 });
    const result = await vision.analyzeGarment(dark);
    assert.equal(result.usable, false);
    assert.ok(result.issues.length >= 2);
  });

  it("describes a clear photo with a colour and category", async () => {
    const red = await solid(800, 1000, { r: 180, g: 30, b: 40 });
    const result = await vision.analyzeGarment(red);
    assert.equal(result.usable, true);
    assert.equal(result.colour, "Red");
    assert.equal(result.category, "one-piece");
  });

  it("returns a deterministic verdict for the same output", async () => {
    const img = await solid(400, 600, { r: 120, g: 120, b: 200 });
    const a = await vision.assessOutput({ garmentImage: img, outputImage: img, analysis: null });
    const b = await vision.assessOutput({ garmentImage: img, outputImage: img, analysis: null });
    assert.deepEqual(a, b);
    assert.ok(a.score > 0 && a.score <= 1);
  });
});
