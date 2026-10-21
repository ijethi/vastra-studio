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

/* ------------------------- colour normalisation ------------------------- */

export type ColourCast = {
  /** Per-channel multipliers (R, G, B) that neutralise the cast. 1 = unchanged. */
  gains: [number, number, number];
  /** Where the estimate came from. */
  source: "background" | "image";
  /** Largest deviation of any gain from 1, after damping. */
  magnitude: number;
};

/** Gains never leave this band: a shop's warm bulbs are corrected, a deliberately warm photo is not destroyed. */
const CAST_GAIN_MIN = 0.86;
const CAST_GAIN_MAX = 1.18;
/** Only this share of the measured cast is removed; the rest is left as atmosphere. */
const CAST_STRENGTH = 0.7;

/**
 * Grey-world estimate of the lighting cast. Prefers the non-garment area
 * (walls, floor, mannequin) because the garment itself is supposed to be
 * coloured; falls back to the whole image when the mask leaves too little.
 * Very dark and clipped pixels are ignored.
 */
export async function estimateColourCast(image: Buffer, garmentMask?: Buffer | null): Promise<ColourCast> {
  const { data, info } = await sharp(image).rotate().removeAlpha().resize(192, 192, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const mask = garmentMask ? await maskPixels(garmentMask, info.width, info.height) : null;

  // Usable pixels: outside the garment (when asked), not near-black, not clipped.
  const usable = (useMask: boolean) => {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (useMask && mask && mask[i] > 64) continue;
      const o = i * info.channels;
      const pr = data[o], pg = data[o + 1], pb = data[o + 2];
      if ((pr + pg + pb) / 3 < 20 || pr > 245 || pg > 245 || pb > 245) continue;
      idx.push(i);
    }
    return idx;
  };

  let idx = mask ? usable(true) : usable(false);
  let source: ColourCast["source"] = mask ? "background" : "image";
  if (idx.length < n * 0.08) {
    idx = usable(false);
    source = "image";
  }
  if (idx.length === 0) return { gains: [1, 1, 1], source, magnitude: 0 };

  const gainsFrom = (indices: number[]): [number, number, number] => {
    let r = 0, g = 0, b = 0;
    for (const i of indices) {
      const o = i * info.channels;
      r += data[o]; g += data[o + 1]; b += data[o + 2];
    }
    const grey = (r + g + b) / 3;
    return [grey / r, grey / g, grey / b];
  };
  // Two estimates: grey-world over everything usable, and white-patch over the brightest sixth
  // (walls, floor tiles, the mannequin). Shop backgrounds are full of coloured fabric, which
  // fools grey-world; the smaller correction of the two is the safer one.
  const greyWorld = gainsFrom(idx);
  const byLum = [...idx].sort((a, b) => lum(data, b * info.channels) - lum(data, a * info.channels));
  const bright = byLum.slice(0, Math.max(16, Math.floor(byLum.length / 6)));
  const whitePatch = gainsFrom(bright);
  const size = (g: number[]) => Math.max(...g.map((v) => Math.abs(v - 1)));
  const raw = size(whitePatch) < size(greyWorld) ? whitePatch : greyWorld;

  const damp = (gain: number) => Math.min(CAST_GAIN_MAX, Math.max(CAST_GAIN_MIN, 1 + (gain - 1) * CAST_STRENGTH));
  const gains: [number, number, number] = [damp(raw[0]), damp(raw[1]), damp(raw[2])];
  const magnitude = Math.max(...gains.map((g) => Math.abs(g - 1)));
  return { gains, source, magnitude };
}

function lum(data: Buffer, o: number): number {
  return data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
}

/** Apply the gains. Casts under 1.5% are left alone; the output is a JPEG. */
export async function normaliseColourCast(image: Buffer, cast: ColourCast): Promise<Buffer> {
  if (cast.magnitude < 0.015) return image;
  return sharp(image).rotate().removeAlpha().linear([...cast.gains], [0, 0, 0]).jpeg({ quality: 95, mozjpeg: true }).toBuffer();
}

/* --------------------------- exact-match check --------------------------- */

export type ExactMatchResult = {
  pass: boolean;
  /** Mean CIE76 colour difference between output and cut-out over the garment area. */
  meanDeltaE: number;
  /** Structural similarity on the masked garment area; null when the garment position in the output is unknown. */
  ssim: number | null;
  /** Share of the torso region whose colour matches the garment palette; null in placed mode. */
  matchedFraction: number | null;
  reasons: string[];
};

/** Placed mode: the garment was pasted at a known position, so the comparison is strict. */
export const EXACT_PLACED_MAX_DELTA_E = 6;
export const EXACT_PLACED_MIN_SSIM = 0.7;
/** Search mode: a try-on provider redrew the garment somewhere on the body; only colour fidelity is checked. */
export const EXACT_SEARCH_MAX_DELTA_E = 10;
export const EXACT_SEARCH_MIN_FRACTION = 0.1;

export type ExactMatchInput =
  | {
      mode: "placed";
      output: Buffer;
      /** RGBA PNG, same size as the output: the cut-out where it was placed. */
      garmentLayer: Buffer;
      /** Greyscale PNG, same size as the output. */
      canvasMask: Buffer;
      placement: MaskBox;
    }
  | {
      mode: "search";
      output: Buffer;
      /** RGBA PNG cut-out in the source photo frame. */
      cutout: Buffer;
      /** Greyscale PNG, same size as the cut-out. */
      mask: Buffer;
    };

/**
 * Mechanical check that the garment in the output is the garment that was
 * uploaded. Runs before the vision verdict so a drifted colour or a redrawn
 * motif is rejected without spending a model call.
 */
export async function checkExactMatch(input: ExactMatchInput): Promise<ExactMatchResult> {
  return input.mode === "placed" ? checkPlaced(input) : checkSearch(input);
}

async function checkPlaced(input: Extract<ExactMatchInput, { mode: "placed" }>): Promise<ExactMatchResult> {
  const region = input.placement;
  if (region.width < 8 || region.height < 8) return { pass: false, meanDeltaE: Infinity, ssim: null, matchedFraction: null, reasons: ["garment changed", "garment region is empty"] };
  const scale = Math.min(1, 320 / region.width);
  const w = Math.max(8, Math.round(region.width * scale)), h = Math.max(8, Math.round(region.height * scale));
  const layerMeta = await sharp(input.garmentLayer).metadata();
  const size = { width: layerMeta.width ?? region.width, height: layerMeta.height ?? region.height };

  // sharp runs extract after resize when both are set on one pipeline, so the canvas fit is its own pass.
  const fitted = await sharp(input.output).rotate().resize(size.width, size.height, { fit: "cover" }).png().toBuffer();
  const [out, ref, mask] = await Promise.all([
    sharp(fitted).extract(region).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer(),
    sharp(input.garmentLayer).extract(region).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer(),
    sharp(input.canvasMask).extract(region).resize(w, h, { fit: "fill" }).toColourspace("b-w").raw().toBuffer(),
  ]);

  // Colour: mean Lab per grid cell, cells that are mostly garment.
  const cell = 16;
  let deltaSum = 0, cells = 0;
  for (let cy = 0; cy + cell <= h; cy += cell) {
    for (let cx = 0; cx + cell <= w; cx += cell) {
      let covered = 0;
      const a = [0, 0, 0], b = [0, 0, 0];
      for (let y = cy; y < cy + cell; y++) {
        for (let x = cx; x < cx + cell; x++) {
          const i = y * w + x;
          if (mask[i] < 200) continue;
          covered++;
          const la = rgbToLab(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
          const lb = rgbToLab(ref[i * 3], ref[i * 3 + 1], ref[i * 3 + 2]);
          for (let k = 0; k < 3; k++) { a[k] += la[k]; b[k] += lb[k]; }
        }
      }
      if (covered < cell * cell * 0.7) continue;
      deltaSum += labDistance([a[0] / covered, a[1] / covered, a[2] / covered], [b[0] / covered, b[1] / covered, b[2] / covered]);
      cells++;
    }
  }
  const meanDeltaE = cells ? deltaSum / cells : Infinity;
  const ssim = ssimMasked(out, ref, mask, w, h);
  const reasons: string[] = [];
  if (meanDeltaE > EXACT_PLACED_MAX_DELTA_E) reasons.push(`colour drifted (ΔE ${meanDeltaE.toFixed(1)})`);
  if (ssim < EXACT_PLACED_MIN_SSIM) reasons.push(`details changed (SSIM ${ssim.toFixed(2)})`);
  if (reasons.length) reasons.unshift("garment changed");
  return { pass: reasons.length === 0, meanDeltaE, ssim, matchedFraction: null, reasons };
}

async function checkSearch(input: Extract<ExactMatchInput, { mode: "search" }>): Promise<ExactMatchResult> {
  // Garment palette from the cut-out.
  const cutMeta = await sharp(input.cutout).metadata();
  const cs = Math.min(1, 160 / Math.max(cutMeta.width ?? 1, cutMeta.height ?? 1));
  const cw = Math.max(8, Math.round((cutMeta.width ?? 8) * cs)), ch = Math.max(8, Math.round((cutMeta.height ?? 8) * cs));
  const [cut, cmask] = await Promise.all([
    sharp(input.cutout).resize(cw, ch, { fit: "fill" }).removeAlpha().raw().toBuffer(),
    sharp(input.mask).resize(cw, ch, { fit: "fill" }).toColourspace("b-w").raw().toBuffer(),
  ]);
  const samples: Array<[number, number, number]> = [];
  for (let i = 0; i < cw * ch; i++) if (cmask[i] > 200) samples.push(rgbToLab(cut[i * 3], cut[i * 3 + 1], cut[i * 3 + 2]));
  if (samples.length < 16) return { pass: false, meanDeltaE: Infinity, ssim: null, matchedFraction: 0, reasons: ["garment changed", "cut-out is empty"] };
  const palette = kmeans(samples, 3);
  // Dominant colour: the cluster with most members.
  const counts = palette.map(() => 0);
  for (const s of samples) {
    let best = 0, bd = Infinity;
    palette.forEach((c, k) => { const d = labDistance(s, c); if (d < bd) { bd = d; best = k; } });
    counts[best]++;
  }
  const dominant = palette[counts.indexOf(Math.max(...counts))];

  // Output torso region.
  const { data, info } = await sharp(input.output).rotate().resize(240, 240, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const x0 = Math.round(info.width * 0.15), x1 = Math.round(info.width * 0.85);
  const y0 = Math.round(info.height * 0.15), y1 = Math.round(info.height * 0.9);
  let matched = 0, total = 0;
  const acc = [0, 0, 0];
  let accN = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * info.width + x;
      const lab = rgbToLab(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
      total++;
      let d = Infinity;
      for (const c of palette) d = Math.min(d, labDistance(lab, c));
      if (d < 14) matched++;
      // Pixels near the dominant colour tell us how far that colour drifted.
      if (labDistance(lab, dominant) < 22) { acc[0] += lab[0]; acc[1] += lab[1]; acc[2] += lab[2]; accN++; }
    }
  }
  const matchedFraction = total ? matched / total : 0;
  const meanDeltaE = accN ? labDistance([acc[0] / accN, acc[1] / accN, acc[2] / accN], dominant) : Infinity;
  const reasons: string[] = [];
  if (matchedFraction < EXACT_SEARCH_MIN_FRACTION) reasons.push(`garment colours barely present in the output (${Math.round(matchedFraction * 100)}%)`);
  if (meanDeltaE > EXACT_SEARCH_MAX_DELTA_E) reasons.push(`main colour drifted (ΔE ${meanDeltaE.toFixed(1)})`);
  if (reasons.length) reasons.unshift("garment changed");
  return { pass: reasons.length === 0, meanDeltaE, ssim: null, matchedFraction, reasons };
}

/** Mean SSIM over 8x8 windows that lie inside the mask, on luminance. */
function ssimMasked(a: Buffer, b: Buffer, mask: Buffer, w: number, h: number): number {
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  const win = 8;
  const grey = (buf: Buffer, i: number) => 0.299 * buf[i * 3] + 0.587 * buf[i * 3 + 1] + 0.114 * buf[i * 3 + 2];
  let sum = 0, windows = 0;
  for (let y = 0; y + win <= h; y += win) {
    for (let x = 0; x + win <= w; x += win) {
      let inside = 0;
      let ma = 0, mb = 0;
      for (let yy = y; yy < y + win; yy++) for (let xx = x; xx < x + win; xx++) { const i = yy * w + xx; if (mask[i] >= 200) inside++; ma += grey(a, i); mb += grey(b, i); }
      if (inside < win * win) continue;
      const n = win * win;
      ma /= n; mb /= n;
      let va = 0, vb = 0, cov = 0;
      for (let yy = y; yy < y + win; yy++) for (let xx = x; xx < x + win; xx++) { const i = yy * w + xx; const da = grey(a, i) - ma, db = grey(b, i) - mb; va += da * da; vb += db * db; cov += da * db; }
      va /= n - 1; vb /= n - 1; cov /= n - 1;
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      windows++;
    }
  }
  return windows ? sum / windows : 0;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}
