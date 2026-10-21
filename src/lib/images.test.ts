import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { ingestUpload, InvalidImageError, finishOutput } from "./images";

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
