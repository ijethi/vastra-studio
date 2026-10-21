/**
 * Renders the real base-model library with Google's Gemini image model:
 * one photoreal Indian woman per catalogue entry, on every backdrop, in a
 * neutral fitted outfit so garments composite cleanly. Writes full-size
 * renders to storage (library/<model>/<backdrop>.jpg, which the pipeline
 * picks up automatically) and ivory previews to /public/base-models.
 *
 *   GEMINI_API_KEY=... pnpm tsx --conditions=react-server scripts/generate-base-model-library.ts [--only bm-regular-wheatish-20s] [--backdrops studio-ivory]
 *
 * Review every render before launch: delete and rerun any that look off.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { BASE_MODELS, BACKDROPS, DEFAULT_BACKDROP_ID, SKIN_TONES, type BaseModel, type Backdrop } from "../src/lib/base-models/catalog";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_IMAGE_MODEL ?? "gemini-nano-banana-2.1";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function prompt(m: BaseModel, b: Backdrop): string {
  const body = { slim: "slim", regular: "average", curvy: "curvy", plus: "plus-size" }[m.bodyType];
  const age = { "20s": "in her twenties", "30s": "in her thirties", "40s": "in her forties" }[m.ageRange];
  const skin = SKIN_TONES[m.skinTone].label.toLowerCase();
  return [
    "Photoreal full-length fashion catalogue photo of one Indian woman, used as a base model for virtual try-on.",
    `She is ${age}, ${body} build, ${skin} skin tone, natural hair, light makeup, relaxed neutral expression, standing straight and facing the camera, arms slightly away from the body, feet shoulder-width apart.`,
    "She wears a plain, fitted, sleeveless charcoal top and plain charcoal straight trousers with no pattern, no logos and no jewellery, so a garment can be placed over them.",
    `Backdrop: ${b.label}, ${b.description}. Soft even daylight, no harsh shadows, true colours.`,
    "Sharp focus, 2:3 portrait, full body with head and feet in frame, no text, no watermark, no other people.",
  ].join(" ");
}

async function render(text: string, seed: number): Promise<Buffer> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey!, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{ type: "text", text }],
      response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "2:3", image_size: "1K", delivery: "inline" },
      generation_config: { seed },
      store: false,
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { output_image?: { data?: string }; steps?: Array<{ type?: string; content?: Array<{ type?: string; data?: string }> }> };
  const b64 = json.output_image?.data ?? json.steps?.find((s) => s.type === "model_output")?.content?.find((c) => c.type === "image")?.data;
  if (!b64) throw new Error("no image in response");
  return Buffer.from(b64, "base64");
}

async function main() {
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set. Add it to .env.local or the environment and rerun.");
    process.exit(1);
  }
  const { getStorage } = await import("../src/lib/storage");
  const storage = getStorage();
  const only = arg("--only");
  const backdropFilter = arg("--backdrops")?.split(",");
  const models = BASE_MODELS.filter((m) => m.active && (!only || m.id === only));
  const backdrops = BACKDROPS.filter((b) => !backdropFilter || backdropFilter.includes(b.id));
  const previewDir = path.resolve("public/base-models");
  await fs.mkdir(previewDir, { recursive: true });

  let done = 0;
  for (const m of models) {
    for (const b of backdrops) {
      const key = `library/${m.id}/${b.id}.jpg`;
      if (await storage.exists(key)) {
        console.log(`skip ${key} (exists)`);
        continue;
      }
      const raw = await render(prompt(m, b), 7);
      const full = await sharp(raw).resize(864, 1296, { fit: "cover", position: "attention" }).jpeg({ quality: 93 }).toBuffer();
      await storage.put(key, full, "image/jpeg");
      if (b.id === DEFAULT_BACKDROP_ID) {
        await sharp(full).resize(432, 648).png().toFile(path.join(previewDir, `${m.id}.png`));
      }
      done++;
      console.log(`rendered ${key}`);
    }
  }
  console.log(`\n${done} render(s) written. Review them in public/base-models and the library/ storage prefix before launch.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
