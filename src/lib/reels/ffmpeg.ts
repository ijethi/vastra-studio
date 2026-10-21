import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

/** Output format every clip and the finished reel share: portrait 9:16 at 25 fps. */
export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 25;

/** Path of the bundled ffmpeg binary (ffmpeg-static), overridable for a system build. */
export function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const p = require("ffmpeg-static") as string | null;
  if (!p) throw new Error("ffmpeg binary not found: install ffmpeg-static or set FFMPEG_PATH");
  return p;
}

export class FfmpegError extends Error {
  constructor(
    message: string,
    public readonly log: string,
  ) {
    super(message);
  }
}

/** Run ffmpeg with the given arguments; rejects with the tail of stderr on failure. */
export function runFfmpeg(args: string[], opts: { timeoutMs?: number } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > 20_000) stderr = stderr.slice(-10_000);
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new FfmpegError("ffmpeg timed out", stderr));
    }, opts.timeoutMs ?? 5 * 60_000);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new FfmpegError(`ffmpeg could not start: ${err.message}`, stderr));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new FfmpegError(`ffmpeg exited with code ${code}: ${stderr.trim().split("\n").slice(-3).join(" | ")}`, stderr));
    });
  });
}

/** A private scratch directory for one render, removed by `cleanup`. */
export async function workDir(prefix: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = path.join(os.tmpdir(), `vastra-${prefix}-${randomBytes(6).toString("hex")}`);
  await fs.mkdir(dir, { recursive: true });
  return { dir, cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
}

/** True when the buffer starts with an ISO base media file box ("ftyp" at byte 4). */
export function isMp4(buf: Buffer): boolean {
  return buf.length > 12 && buf.toString("latin1", 4, 8) === "ftyp";
}

/** Encoder flags shared by every render: H.264 that phones and Instagram accept, moov atom first. */
export const H264_ARGS = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"];
