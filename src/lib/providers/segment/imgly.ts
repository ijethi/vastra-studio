import sharp from "sharp";
import { finaliseMask, inputSize, refineGarmentMask, toWorkingRgb, writeDebug, WORK_SIZE } from "./mask";
import { SegmentError, type GarmentSegmenter, type SegmentResult } from "./types";

type RemoveBackground = (
  input: Blob,
  config?: { publicPath?: string; model?: "small" | "medium"; output?: { format?: string; quality?: number; type?: "foreground" | "background" | "mask" }; debug?: boolean },
) => Promise<Blob>;

/**
 * Open-source background removal (IMG.LY's ISNet port) on CPU through
 * onnxruntime-node. The ONNX weights ship inside the package, so it needs no
 * key and no network. About 3-5 s per photo on a laptop; the heuristic is the
 * fallback when the native module does not load.
 *
 * The package's "mask" output type returns the foreground in v1.4.5, so the
 * mask is read from the alpha channel of the foreground instead. The model
 * separates subject from background, not garment from mannequin: the neck
 * stump and stand are trimmed afterwards by refineGarmentMask.
 */
export class ImglySegmenter implements GarmentSegmenter {
  readonly name = "imgly";
  private loader: Promise<RemoveBackground | null> | null = null;

  private publicPath = "";

  private load(): Promise<RemoveBackground | null> {
    if (!this.loader) {
      this.loader = (async () => {
        try {
          // require, not import(): the package is a server external and tsx cannot
          // resolve a bare dynamic import from a transformed module.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const mod = require("@imgly/background-removal-node") as { removeBackground: RemoveBackground };
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { pathToFileURL } = require("node:url") as typeof import("node:url");
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const path = require("node:path") as typeof import("node:path");
          // Resolve the package on the real filesystem from the project root. Inside Turbopack the
          // bundler-provided require.resolve points at its own externals shim, not the dist folder,
          // which is why the model resources were not found under `next dev`.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { createRequire } = require("node:module") as typeof import("node:module");
          const projectRequire = createRequire(path.join(process.cwd(), "package.json"));
          this.publicPath = pathToFileURL(path.dirname(projectRequire.resolve("@imgly/background-removal-node"))).href + "/";
          return mod.removeBackground;
        } catch (err) {
          console.warn("[segment:imgly] not available:", (err as Error).message);
          return null;
        }
      })();
    }
    return this.loader;
  }

  async isAvailable(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  async segment(image: Buffer): Promise<SegmentResult> {
    const removeBackground = await this.load();
    if (!removeBackground) throw new SegmentError(this.name, "module not available");

    // Decode first: the model takes JPEG/PNG; the app stores JPEG but samples may be WebP.
    const upright = await sharp(image).rotate().removeAlpha().jpeg({ quality: 95 }).toBuffer();
    const target = await inputSize(upright);
    let foreground: Buffer;
    try {
      const blob = await removeBackground(new Blob([new Uint8Array(upright)], { type: "image/jpeg" }), {
        publicPath: this.publicPath,
        model: "medium",
        output: { format: "image/png", quality: 1, type: "foreground" },
      });
      foreground = Buffer.from(await blob.arrayBuffer());
    } catch (err) {
      throw new SegmentError(this.name, (err as Error).message);
    }

    const work = await toWorkingRgb(upright, WORK_SIZE);
    const alpha = await sharp(foreground).ensureAlpha().extractChannel(3).resize(work.width, work.height, { fit: "fill" }).raw().toBuffer();
    const raw = new Uint8Array(alpha.buffer, alpha.byteOffset, alpha.length);
    const refined = refineGarmentMask(work, raw);
    const result = await finaliseMask(refined.mask, work, target, this.name);
    await writeDebug({
      "segment-imgly-foreground.png": foreground,
      "segment-imgly-mask.png": result.mask,
    });
    return result;
  }
}
