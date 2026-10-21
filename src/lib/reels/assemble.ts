import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { H264_ARGS, REEL_FPS, REEL_HEIGHT, REEL_WIDTH, runFfmpeg, workDir } from "./ffmpeg";

/** Length of every clip in the finished reel; shorter provider clips are held on their last frame, longer ones trimmed. */
export const CLIP_SECONDS = 5;
/** Cross-dissolve between clips. */
export const DISSOLVE_SECONDS = 0.4;
/** The closing card with the boutique name. */
export const END_CARD_SECONDS = 2;

export type AssembleInput = {
  /** MP4 clips in playback order. */
  clips: Buffer[];
  /** Burned in over the clips (garment title, price); null for no overlay. */
  caption: string | null;
  boutiqueName: string;
  clipSeconds?: number;
  dissolveSeconds?: number;
  endCardSeconds?: number;
};

export type AssembleOutput = { video: Buffer; durationSec: number };

/**
 * Stitch the clips into one 1080x1920 reel: each clip normalised to the same
 * size, frame rate and length, a slight warm grade, 0.4 s dissolves, an
 * optional caption, and a two-second end card with the boutique name.
 */
export async function assembleReel(input: AssembleInput): Promise<AssembleOutput> {
  if (input.clips.length === 0) throw new Error("assembleReel needs at least one clip");
  const D = input.clipSeconds ?? CLIP_SECONDS;
  const X = input.dissolveSeconds ?? DISSOLVE_SECONDS;
  const E = input.endCardSeconds ?? END_CARD_SECONDS;
  const { dir, cleanup } = await workDir("reel");
  try {
    const args: string[] = [];
    for (let i = 0; i < input.clips.length; i++) {
      const p = path.join(dir, `clip-${i}.mp4`);
      await fs.writeFile(p, input.clips[i]);
      args.push("-i", p);
    }
    const endCard = path.join(dir, "end.png");
    await fs.writeFile(endCard, await renderEndCard(input.boutiqueName));
    const endIndex = input.clips.length;
    args.push("-loop", "1", "-framerate", String(REEL_FPS), "-t", String(E), "-i", endCard);

    let captionIndex = -1;
    if (input.caption?.trim()) {
      const captionPng = path.join(dir, "caption.png");
      await fs.writeFile(captionPng, await renderCaption(input.caption.trim()));
      captionIndex = endIndex + 1;
      args.push("-i", captionPng);
    }

    const filters: string[] = [];
    const norm = `scale=${REEL_WIDTH}:${REEL_HEIGHT}:force_original_aspect_ratio=increase,crop=${REEL_WIDTH}:${REEL_HEIGHT},fps=${REEL_FPS}`;
    // Warm grade: a touch of red in the highlights and shadows, a touch less blue, slightly richer colour.
    const grade = "colorbalance=rs=0.05:gs=0.01:bs=-0.06:rm=0.03:bm=-0.03,eq=saturation=1.06:contrast=1.02";
    for (let i = 0; i < input.clips.length; i++) {
      filters.push(
        `[${i}:v]${norm},trim=duration=${D},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${D},trim=duration=${D},setpts=PTS-STARTPTS,${grade},format=yuv420p,setsar=1[v${i}]`,
      );
    }
    filters.push(`[${endIndex}:v]${norm},trim=duration=${E},setpts=PTS-STARTPTS,format=yuv420p,setsar=1[v${endIndex}]`);

    // Chain of dissolves. Each join starts X seconds before the running total ends.
    const segments = [...input.clips.map(() => D), E];
    let acc = segments[0];
    let last = "v0";
    for (let k = 1; k < segments.length; k++) {
      const offset = Math.max(0, acc - X);
      const out = k === segments.length - 1 ? "joined" : `x${k}`;
      filters.push(`[${last}][v${k}]xfade=transition=fade:duration=${X}:offset=${offset.toFixed(3)}[${out}]`);
      acc = acc + segments[k] - X;
      last = out;
    }
    const clipsEnd = input.clips.length * D - (input.clips.length - 1) * X;
    if (captionIndex >= 0) {
      filters.push(`[joined][${captionIndex}:v]overlay=0:0:enable='lt(t,${(clipsEnd - X).toFixed(3)})'[out]`);
    } else {
      filters.push(`[joined]copy[out]`);
    }

    const out = path.join(dir, "reel.mp4");
    await runFfmpeg([...args, "-filter_complex", filters.join(";"), "-map", "[out]", "-r", String(REEL_FPS), ...H264_ARGS, out], { timeoutMs: 10 * 60_000 });
    const video = await fs.readFile(out);
    return { video, durationSec: Math.round(acc * 10) / 10 };
  } finally {
    await cleanup();
  }
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

const FONT = "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Transparent 1080x1920 layer with the caption in a soft pill near the bottom, clear of Instagram's own UI. */
export async function renderCaption(text: string): Promise<Buffer> {
  const lines = wrap(text, 26).slice(0, 2);
  const fontSize = 52;
  const lineHeight = 64;
  const padX = 44;
  const padY = 30;
  const width = Math.min(REEL_WIDTH - 120, Math.max(...lines.map((l) => l.length)) * fontSize * 0.56 + padX * 2);
  const height = lines.length * lineHeight + padY * 2;
  const x = (REEL_WIDTH - width) / 2;
  const y = REEL_HEIGHT - 400 - height;
  const svg = `<svg width="${REEL_WIDTH}" height="${REEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" fill="#15121e" fill-opacity="0.62" />
    ${lines
      .map(
        (l, i) =>
          `<text x="${REEL_WIDTH / 2}" y="${y + padY + lineHeight * (i + 1) - 16}" text-anchor="middle" font-family="${FONT}" font-size="${fontSize}" font-weight="700" fill="#ffffff">${escapeXml(l)}</text>`,
      )
      .join("")}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Indigo-night end card: boutique name, a rani pink rule, a small credit line. */
export async function renderEndCard(boutiqueName: string): Promise<Buffer> {
  const name = boutiqueName.trim() || "Your boutique";
  const lines = wrap(name, 18).slice(0, 3);
  const size = lines.length > 1 ? 92 : Math.min(120, Math.round(1500 / Math.max(6, name.length)) + 40);
  const lineHeight = size * 1.15;
  const startY = REEL_HEIGHT / 2 - ((lines.length - 1) * lineHeight) / 2;
  const svg = `<svg width="${REEL_WIDTH}" height="${REEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g" cx="85%" cy="0%" r="120%">
        <stop offset="0%" stop-color="#2a2150" />
        <stop offset="60%" stop-color="#15121e" />
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)" />
    ${lines
      .map(
        (l, i) =>
          `<text x="${REEL_WIDTH / 2}" y="${startY + i * lineHeight}" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="${size}" font-weight="800" letter-spacing="-2" fill="#f3f1f7">${escapeXml(l)}</text>`,
      )
      .join("")}
    <rect x="${REEL_WIDTH / 2 - 60}" y="${startY + (lines.length - 0.5) * lineHeight + 40}" width="120" height="8" rx="4" fill="#e0127a" />
    <text x="${REEL_WIDTH / 2}" y="${REEL_HEIGHT - 220}" text-anchor="middle" font-family="${FONT}" font-size="30" letter-spacing="6" fill="#aea8bf">MADE WITH VASTRA STUDIO</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}
