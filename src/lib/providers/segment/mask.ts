import path from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import type { MaskBox, SegmentResult } from "./types";

/** Long side used for pixel work; masks are upscaled back to the input size. */
export const WORK_SIZE = 512;

export type RawImage = { data: Buffer; width: number; height: number; channels: number };

export async function toWorkingRgb(image: Buffer, size = WORK_SIZE): Promise<RawImage> {
  const { data, info } = await sharp(image)
    .rotate()
    .resize(size, size, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

export async function inputSize(image: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(image).rotate().metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

/* ------------------------------ colour ------------------------------ */

/** sRGB (0..255) to CIE Lab (D65). */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const rl = lin(r), gl = lin(g), bl = lin(b);
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Lab for every pixel of a raw RGB image as a Float32Array of length w*h*3. */
export function labImage(img: RawImage): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const o = i * img.channels;
    const [l, a, b] = rgbToLab(img.data[o], img.data[o + 1], img.data[o + 2]);
    out[i * 3] = l;
    out[i * 3 + 1] = a;
    out[i * 3 + 2] = b;
  }
  return out;
}

/** Small k-means in Lab space; returns cluster centres. */
export function kmeans(samples: Array<[number, number, number]>, k: number, iterations = 8): Array<[number, number, number]> {
  if (samples.length === 0) return [];
  k = Math.min(k, samples.length);
  const centres: Array<[number, number, number]> = [];
  const step = Math.max(1, Math.floor(samples.length / k));
  for (let i = 0; i < k; i++) centres.push([...samples[i * step]] as [number, number, number]);
  const assign = new Uint8Array(samples.length);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < samples.length; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = labDistance(samples[i], centres[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      assign[i] = best;
    }
    const sum = centres.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < samples.length; i++) {
      const s = sum[assign[i]];
      s[0] += samples[i][0]; s[1] += samples[i][1]; s[2] += samples[i][2]; s[3]++;
    }
    for (let c = 0; c < k; c++) if (sum[c][3] > 0) centres[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
  }
  return centres;
}

/* ------------------------------ refinement ------------------------------ */

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function boxOf(mask: Uint8Array, width: number, height: number, threshold = 64): MaskBox {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { left: 0, top: 0, width: 0, height: 0 };
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Turn a foreground mask (garment + whatever held it) into a garment mask:
 *  - drops neutral (white/grey/black) regions at the top and bottom of the
 *    foreground when the garment itself is clearly coloured: mannequin neck,
 *    shoulders and the metal stand. Ivory and black garments skip this step
 *    because the colour cue cannot separate them from a white mannequin;
 *  - keeps only the largest connected blob so stray background bits go.
 * Operates at working resolution on a Uint8Array (0..255).
 */
export function refineGarmentMask(img: RawImage, mask: Uint8Array): { mask: Uint8Array; trimmedNeutral: boolean } {
  const { width, height } = img;
  const lab = labImage(img);
  const box = boxOf(mask, width, height);
  if (box.width === 0) return { mask, trimmedNeutral: false };

  // Garment statistics from the solid core of the mask, central band only.
  const coreL: number[] = [], coreC: number[] = [];
  const cx0 = box.left + box.width * 0.3, cx1 = box.left + box.width * 0.7;
  const cy0 = box.top + box.height * 0.3, cy1 = box.top + box.height * 0.7;
  for (let y = Math.floor(cy0); y < cy1; y += 2) {
    for (let x = Math.floor(cx0); x < cx1; x += 2) {
      const i = y * width + x;
      if (mask[i] > 200) {
        coreL.push(lab[i * 3]);
        coreC.push(Math.hypot(lab[i * 3 + 1], lab[i * 3 + 2]));
      }
    }
  }
  const garmentL = median(coreL);
  const garmentChroma = median(coreC);
  const chromatic = garmentChroma > 18;

  const out = new Uint8Array(mask);
  let trimmedNeutral = false;
  if (chromatic) {
    const topLimit = box.top + box.height * 0.28;
    const bottomLimit = box.top + box.height * 0.8;
    for (let y = box.top; y < box.top + box.height; y++) {
      const edgeZone = y < topLimit || y > bottomLimit;
      if (!edgeZone) continue;
      for (let x = box.left; x < box.left + box.width; x++) {
        const i = y * width + x;
        if (out[i] === 0) continue;
        const chroma = Math.hypot(lab[i * 3 + 1], lab[i * 3 + 2]);
        const dL = Math.abs(lab[i * 3] - garmentL);
        if (chroma < 9 && dL > 15) {
          out[i] = 0;
          trimmedNeutral = true;
        }
      }
    }
    // A neutral trim leaves ragged single pixels; a light erosion settles them.
    if (trimmedNeutral) erode(out, width, height, 1);
  }

  keepLargestComponent(out, width, height);
  return { mask: out, trimmedNeutral };
}

function erode(mask: Uint8Array, width: number, height: number, radius: number) {
  const src = new Uint8Array(mask);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (src[i] < 128) continue;
      let min = 255;
      for (let dy = -radius; dy <= radius && min >= 128; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) { min = 0; break; }
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) { min = 0; break; }
          const v = src[yy * width + xx];
          if (v < min) min = v;
        }
      }
      if (min < 128) mask[i] = Math.min(mask[i], 96);
    }
  }
}

/** Zero everything outside the biggest 4-connected blob of mask >= 128 (plus a 2 px halo for soft edges). */
export function keepLargestComponent(mask: Uint8Array, width: number, height: number) {
  const label = new Int32Array(width * height).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] < 128 || label[start] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    stack.push(start);
    label[start] = id;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % width, y = (i - x) / width;
      const nb = [i - 1, i + 1, i - width, i + width];
      const ok = [x > 0, x < width - 1, y > 0, y < height - 1];
      for (let n = 0; n < 4; n++) {
        const j = nb[n];
        if (ok[n] && label[j] < 0 && mask[j] >= 128) { label[j] = id; stack.push(j); }
      }
    }
    sizes.push(size);
  }
  if (sizes.length <= 1) return;
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  const keep = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) if (label[i] === best) keep[i] = 1;
  // Halo: soft-edge pixels within 2 px of the kept blob survive.
  for (let i = 0; i < mask.length; i++) {
    if (label[i] === best || mask[i] === 0) continue;
    const x = i % width, y = (i - x) / width;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < width && yy < height && keep[yy * width + xx]) { near = true; break; }
      }
    }
    if (!near) mask[i] = 0;
  }
}

/* ------------------------------ output ------------------------------ */

/** Upscale a working-resolution mask to the input size, feather it, and package the result. */
export async function finaliseMask(mask: Uint8Array, work: { width: number; height: number }, target: { width: number; height: number }, segmenter: string): Promise<SegmentResult> {
  // sharp promotes a 1-channel raw input to sRGB after blur/resize; force it back to one channel.
  const feathered = await sharp(Buffer.from(mask.buffer, mask.byteOffset, mask.length), { raw: { width: work.width, height: work.height, channels: 1 } })
    .blur(0.8)
    .resize(target.width, target.height, { fit: "fill", kernel: "cubic" })
    .toColourspace("b-w")
    .raw()
    .toBuffer();
  if (feathered.length !== target.width * target.height) throw new Error(`mask has ${feathered.length / (target.width * target.height)} channels, expected 1`);
  const full = new Uint8Array(feathered.buffer, feathered.byteOffset, feathered.length);
  const bbox = boxOf(full, target.width, target.height);
  let sum = 0;
  for (let i = 0; i < full.length; i++) sum += full[i];
  const coverage = sum / 255 / full.length;
  const png = await sharp(feathered, { raw: { width: target.width, height: target.height, channels: 1 } }).png({ compressionLevel: 6 }).toBuffer();
  return { mask: png, width: target.width, height: target.height, bbox, coverage, segmenter };
}

/** Decode a mask PNG to 8-bit grey pixels at the given size. */
export async function maskPixels(maskPng: Buffer, width: number, height: number): Promise<Uint8Array> {
  const buf = await sharp(maskPng).resize(width, height, { fit: "fill" }).toColourspace("b-w").raw().toBuffer();
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}

/**
 * RGBA PNG built from raw RGB pixels and a raw 8-bit alpha plane. Done by hand
 * because sharp's joinChannel does not mark the extra band as alpha and a
 * greyscale overlay has no alpha for dest-in to use.
 */
export async function rgbaFromAlpha(rgb: Buffer, alpha: Uint8Array | Buffer, width: number, height: number): Promise<Buffer> {
  const n = width * height;
  if (rgb.length !== n * 3) throw new Error(`expected ${n * 3} RGB bytes, got ${rgb.length}`);
  if (alpha.length !== n) throw new Error(`expected ${n} alpha bytes, got ${alpha.length}`);
  const out = Buffer.alloc(n * 4);
  for (let i = 0, o = 0, p = 0; i < n; i++, o += 4, p += 3) {
    out[o] = rgb[p];
    out[o + 1] = rgb[p + 1];
    out[o + 2] = rgb[p + 2];
    out[o + 3] = alpha[i];
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 6 }).toBuffer();
}

/** RGBA PNG of the image with the mask as alpha. */
export async function applyMask(image: Buffer, maskPng: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(image).rotate().removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const alpha = await maskPixels(maskPng, info.width, info.height);
  return rgbaFromAlpha(data, alpha, info.width, info.height);
}

/**
 * The cut-out on a plain light-grey card, cropped to the garment with a
 * margin: what try-on providers get instead of the cluttered shop photo.
 */
export async function garmentOnNeutralCanvas(cutoutPng: Buffer, bbox: MaskBox, opts: { margin?: number; background?: string } = {}): Promise<Buffer> {
  const margin = opts.margin ?? 0.08;
  const meta = await sharp(cutoutPng).metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  const padX = Math.round(bbox.width * margin), padY = Math.round(bbox.height * margin);
  const left = Math.max(0, bbox.left - padX), top = Math.max(0, bbox.top - padY);
  const right = Math.min(w, bbox.left + bbox.width + padX), bottom = Math.min(h, bbox.top + bbox.height + padY);
  const region = { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  return sharp(cutoutPng)
    .extract(region)
    .flatten({ background: opts.background ?? "#ECEBE8" })
    .jpeg({ quality: 95 })
    .toBuffer();
}

/* ------------------------------ debug ------------------------------ */

export const DEBUG_DIR = path.resolve(".data/debug");

/** Writes intermediate images to .data/debug when DEBUG_SEGMENT=1. */
export async function writeDebug(files: Record<string, Buffer>): Promise<void> {
  if (process.env.DEBUG_SEGMENT !== "1") return;
  await fs.mkdir(DEBUG_DIR, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, buf]) => fs.writeFile(path.join(DEBUG_DIR, name), buf)));
}
