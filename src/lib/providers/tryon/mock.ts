import sharp from "sharp";
import type { TryOnInput, TryOnOutput, TryOnProvider } from "./types";

/**
 * Development provider. Composites the garment onto the base model's torso so
 * the whole pipeline (upload, queue, gate, gallery, download) can be exercised
 * without API keys. Output is clearly a preview, not a sellable image.
 */
export class MockTryOnProvider implements TryOnProvider {
  readonly name = "mock";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(input: TryOnInput): Promise<TryOnOutput> {
    const seed = input.seed ?? Math.floor(Math.random() * 1_000_000);
    const base = sharp(input.modelImage).rotate();
    const meta = await base.metadata();
    const width = meta.width ?? 864;
    const height = meta.height ?? 1296;

    // Torso box: roughly shoulders to knee for a full-length figure.
    const fullLength = input.category === "one-piece" || input.category === "set" || input.category === "saree" || input.category === "lehenga";
    const boxW = Math.round(width * (0.36 + (seed % 7) * 0.004));
    const boxH = Math.round(height * (fullLength ? 0.58 : input.category === "bottom" ? 0.34 : 0.3));
    const top = Math.round(height * (input.category === "bottom" ? 0.46 : 0.21));
    const left = Math.round((width - boxW) / 2);

    const garment = await sharp(input.garmentImage)
      .rotate()
      .resize(boxW, boxH, { fit: "cover", position: "attention" })
      .modulate({ brightness: 0.98 + ((seed % 5) - 2) * 0.01 })
      .png()
      .toBuffer();

    // Rounded mask so the overlay reads as a garment rather than a rectangle.
    const r = Math.round(boxW * 0.18);
    const mask = Buffer.from(
      `<svg width="${boxW}" height="${boxH}"><rect x="0" y="0" width="${boxW}" height="${boxH}" rx="${r}" ry="${r}" fill="white"/></svg>`,
    );
    const masked = await sharp(garment)
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();

    // Simulate provider latency so progress UI is exercised.
    await new Promise((r) => setTimeout(r, 900 + (seed % 900)));

    const image = await base
      .composite([{ input: masked, top, left }])
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    return { image, contentType: "image/jpeg", width, height, seed, provider: this.name, costUsd: 0 };
  }
}
