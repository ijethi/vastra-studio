import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { ReelShotType } from "@/lib/db/schema";
import { H264_ARGS, REEL_FPS, REEL_HEIGHT, REEL_WIDTH, runFfmpeg, workDir } from "@/lib/reels/ffmpeg";
import type { VideoInput, VideoOutput, VideoProvider } from "./types";

/** Pre-scale factor: zoompan on a larger source keeps the pan smooth. */
const OVERSAMPLE = 1.5;

/** Camera move per shot type, as zoompan expressions over `on` (output frame) of `N` frames. */
function cameraMove(shotType: ReelShotType | undefined, frames: number): { z: string; x: string; y: string } {
  const p = `(on/${frames})`;
  const cx = "iw/2-(iw/zoom/2)";
  const cy = "ih/2-(ih/zoom/2)";
  switch (shotType) {
    case "full-body":
      // Tilt down the body at a fixed zoom.
      return { z: "1.12", x: cx, y: `(ih-ih/zoom)*${p}` };
    case "movement":
      // Pan across the frame.
      return { z: "1.15", x: `(iw-iw/zoom)*${p}`, y: cy };
    case "detail":
      // Push in on the fabric around the waist.
      return { z: `1.1+0.3*${p}`, x: cx, y: "(ih-ih/zoom)*0.4" };
    case "hero-portrait":
      // Settle out from a close frame on the face.
      return { z: `1.25-0.18*${p}`, x: cx, y: "(ih-ih/zoom)*0.12" };
    case "wide-hook":
    default:
      // Slow push in from the whole frame.
      return { z: `1+0.18*${p}`, x: cx, y: cy };
  }
}

/**
 * Offline clip: a Ken Burns pan-and-zoom over the still, rendered with the
 * bundled ffmpeg. Output matches the real providers (1080x1920 H.264 MP4).
 */
export class MockVideoProvider implements VideoProvider {
  readonly name = "mock";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async animate(input: VideoInput): Promise<VideoOutput> {
    const seconds = Math.max(1, Math.min(15, input.durationSec || 5));
    const frames = Math.round(seconds * REEL_FPS);
    const { dir, cleanup } = await workDir("clip");
    try {
      const src = path.join(dir, "still.png");
      const out = path.join(dir, "clip.mp4");
      const w = Math.round(REEL_WIDTH * OVERSAMPLE);
      const h = Math.round(REEL_HEIGHT * OVERSAMPLE);
      // Portrait cover crop at the oversampled size; zoompan then works on an even-sized frame.
      await fs.writeFile(src, await sharp(input.image).rotate().resize(w, h, { fit: "cover", position: "attention" }).png().toBuffer());
      const m = cameraMove(input.shotType, frames);
      const vf = `zoompan=z='${m.z}':x='${m.x}':y='${m.y}':d=${frames}:s=${REEL_WIDTH}x${REEL_HEIGHT}:fps=${REEL_FPS},format=yuv420p`;
      await runFfmpeg(["-i", src, "-vf", vf, "-frames:v", String(frames), "-r", String(REEL_FPS), ...H264_ARGS, out], { timeoutMs: Math.min(input.timeoutMs, 5 * 60_000) });
      const video = await fs.readFile(out);
      return { video, contentType: "video/mp4", durationSec: seconds, width: REEL_WIDTH, height: REEL_HEIGHT, provider: this.name, costUsd: 0 };
    } finally {
      await cleanup();
    }
  }
}
