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
    assert.equal(result.photoType, "hanger");
  });

  it("guesses photoType from the frame and keeps tips to one friendly sentence", async () => {
    const tall = await solid(500, 1100, { r: 180, g: 30, b: 40 });
    assert.equal((await vision.analyzeGarment(tall)).photoType, "mannequin");
    const wide = await solid(1000, 700, { r: 180, g: 30, b: 40 });
    assert.equal((await vision.analyzeGarment(wide)).photoType, "flat-lay");
    const dark = await solid(200, 200, { r: 5, g: 5, b: 5 });
    for (const issue of (await vision.analyzeGarment(dark)).issues) {
      assert.ok(/^[A-Z].*\. .*\.$/.test(issue), `reason then suggestion: ${issue}`);
      assert.ok(issue.length < 90, `short: ${issue}`);
    }
  });

  it("returns a deterministic verdict for the same output", async () => {
    const img = await solid(400, 600, { r: 120, g: 120, b: 200 });
    const a = await vision.assessOutput({ garmentImage: img, outputImage: img, analysis: null });
    const b = await vision.assessOutput({ garmentImage: img, outputImage: img, analysis: null });
    assert.deepEqual(a, b);
    assert.ok(a.score > 0 && a.score <= 1);
  });
});
