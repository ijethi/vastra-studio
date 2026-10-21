import "server-only";
import sharp, { type Metadata } from "sharp";
import { MAX_PIXELS } from "@/lib/storage";
import { kmeans, labDistance, maskPixels, rgbToLab } from "@/lib/providers/segment/mask";
import type { MaskBox } from "@/lib/providers/segment/types";

export class InvalidImageError extends Error {}

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif"]);

/**
 * Validate an upload by its real content (not its declared type), then
 * re-encode it. Re-encoding strips EXIF/GPS metadata and neutralises any
 * malformed container; the pixel cap guards against decompression bombs.
 */
export async function ingestUpload(buf: Buffer): Promise<{ original: Buffer; thumb: Buffer; width: number; height: number }> {
  let meta: Metadata;
  try {
    meta = await sharp(buf, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new InvalidImageError("That file is not an image we can read.");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new InvalidImageError("Please upload a JPEG, PNG, WebP or HEIC photo.");
  }
  if (!meta.width || !meta.height || meta.width * meta.height > MAX_PIXELS) {
    throw new InvalidImageError("That image is too large.");
  }
  const base = sharp(buf, { limitInputPixels: MAX_PIXELS }).rotate(); // honours EXIF orientation, then drops EXIF
  const original = await base.clone().resize(2400, 2400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const thumb = await base.clone().resize(480, 480, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
  const outMeta = await sharp(original).metadata();
  return { original, thumb, width: outMeta.width ?? meta.width, height: outMeta.height ?? meta.height };
}

export async function makeThumb(buf: Buffer, size = 540): Promise<Buffer> {
  return sharp(buf).resize(size, size, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
}

export type Provenance = {
  generator: string;
  provider: string;
  jobId: string;
  imageId: string;
  seed: number | null;
  generatedAt: string;
  synthetic: true;
};

/**
 * Final touches on a provider output: optional visible watermark and an
 * embedded provenance statement. Full C2PA signing (certificate-backed) is a
 * launch item; until then the statement lives in the JPEG's ImageDescription
 * and alongside the image in the database.
 */
export async function finishOutput(
  image: Buffer,
  opts: { watermarkText?: string | null; provenance: Provenance },
): Promise<{ image: Buffer; width: number; height: number }> {
  let pipeline = sharp(image).rotate();
  const meta = await pipeline.metadata();
  const width = meta.width ?? 864;
  const height = meta.height ?? 1296;

  if (opts.watermarkText) {
    const fontSize = Math.max(18, Math.round(width * 0.028));
    const pad = Math.round(width * 0.03);
    const svg = Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <text x="${width - pad}" y="${height - pad}" text-anchor="end" font-family="Georgia, serif" font-size="${fontSize}"
          fill="white" fill-opacity="0.85" stroke="black" stroke-opacity="0.25" stroke-width="1">${escapeXml(opts.watermarkText)}</text>
      </svg>`,
    );
    pipeline = pipeline.composite([{ input: svg, top: 0, left: 0 }]);
  }

  const out = await pipeline
    .withExif({ IFD0: { ImageDescription: `AI-generated image. ${JSON.stringify(opts.provenance)}` } })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  return { image: out, width, height };
}

export type DownloadSize = "original" | "ig-portrait" | "story" | "print";

export async function renderForDownload(image: Buffer, size: DownloadSize): Promise<Buffer> {
  const s = sharp(image);
  switch (size) {
    case "ig-portrait":
      return s.resize(1080, 1350, { fit: "cover", position: "attention" }).jpeg({ quality: 92 }).toBuffer();
    case "story":
      return s.resize(1080, 1920, { fit: "cover", position: "attention" }).jpeg({ quality: 92 }).toBuffer();
    case "print": {
      // Lanczos 2x upscale. Swap for a provider upscaler when 4K print quality is required.
      const meta = await s.metadata();
      return s.resize({ width: (meta.width ?? 864) * 2, kernel: "lanczos3" }).jpeg({ quality: 95 }).toBuffer();
    }
    default:
      return image;
  }
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}
