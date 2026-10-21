/**
 * Runs one garment photo through the exact-garment pipeline offline and writes
 * every stage to .data/debug/try-exact-mode/<timestamp>/:
 *
 *   analysis (mock vision)  ->  segmentation + colour normalisation
 *   ->  exact route: mock person generator keeps the garment pixels
 *   ->  try-on route: mock try-on provider gets the cut-out on a neutral card
 *   ->  mechanical exact-match check on both  ->  mock vision verdict  ->  finished JPEG
 *
 * Usage:
 *   pnpm tsx --conditions=react-server scripts/try-exact-mode.ts [photo] [--segmenter=auto|imgly|heuristic|mock] [--model=bm-regular-wheatish-20s] [--backdrop=studio-ivory]
 *
 * Defaults to public/samples/real-mannequin-coral-kurta.webp. `--conditions=react-server`
 * is needed because the library modules import `server-only`. Nothing touches the database.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  const photo = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "public/samples/real-mannequin-coral-kurta.webp";
  const segmenterName = arg("segmenter", "auto");
  const modelId = arg("model", "bm-regular-wheatish-20s");
  const backdrop = arg("backdrop", "studio-ivory");

  // Library modules validate the environment at import; give the script safe offline defaults.
  process.env.AUTH_SECRET ??= "try-exact-mode-secret-try-exact-mode-secret";
  process.env.APP_URL ??= "http://localhost:3000";
  process.env.SEGMENTER = segmenterName;
  process.env.PERSON_PROVIDER = "mock";
  process.env.DEBUG_SEGMENT ??= "1";

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve(".data/debug/try-exact-mode", stamp);
  await fs.mkdir(outDir, { recursive: true });
  const save = async (name: string, buf: Buffer) => {
    await fs.writeFile(path.join(outDir, name), buf);
    return name;
  };

  const { MockVisionProvider } = await import("../src/lib/providers/vision/mock");
  const { getSegmenter } = await import("../src/lib/providers/segment");
  const { MockPersonGenerator } = await import("../src/lib/providers/person/mock");
  const { MockTryOnProvider } = await import("../src/lib/providers/tryon/mock");
  const { prepareGarment, checkPersonOutput, checkTryOnOutput, exactMatchVerdict } = await import("../src/lib/jobs/exact-mode");
  const { finishOutput } = await import("../src/lib/images");
  const { getBaseModel } = await import("../src/lib/base-models/catalog");
  const { renderBaseModelPng } = await import("../src/lib/base-models/render");

  const image = await fs.readFile(path.resolve(photo));
  const vision = new MockVisionProvider();
  const model = getBaseModel(modelId);
  if (!model) throw new Error(`Unknown base model ${modelId}`);

  console.log(`photo: ${photo}`);
  let t = performance.now();
  const analysis = await vision.analyzeGarment(image);
  console.log(`analysis (mock): category=${analysis.category} photoType=${analysis.photoType} usable=${analysis.usable} issues=${JSON.stringify(analysis.issues)}`);

  const segmenter = await getSegmenter();
  t = performance.now();
  const prepared = await prepareGarment(image, analysis, segmenter, { debugPrefix: "script" });
  console.log(`prepare: ${Math.round(performance.now() - t)} ms, segmenter=${prepared.segment?.segmenter ?? "none"} coverage=${prepared.segment?.coverage.toFixed(3) ?? "-"} bbox=${JSON.stringify(prepared.segment?.bbox)} route=${prepared.mode}`);
  console.log(`colour cast: gains=${prepared.cast.gains.map((g) => g.toFixed(3)).join("/")} source=${prepared.cast.source} magnitude=${prepared.cast.magnitude.toFixed(3)}`);
  await save("01-normalised.jpg", prepared.normalised);
  if (prepared.segment) await save("02-mask.png", prepared.segment.mask);
  if (prepared.cutout) await save("03-cutout.png", prepared.cutout);
  await save("04-garment-for-tryon.jpg", prepared.garmentForTryOn);

  const baseModelImage = await renderBaseModelPng(model, backdrop);
  const seed = 42;
  const provenance = (provider: string, imageId: string) => ({ generator: "Vastra Studio", provider, jobId: "script", imageId, seed, generatedAt: new Date().toISOString(), synthetic: true as const });

  // Exact route.
  if (prepared.cutout && prepared.segment) {
    t = performance.now();
    const person = await new MockPersonGenerator().generate({
      garmentCutout: prepared.cutout,
      garmentMask: prepared.segment.mask,
      hints: { bodyType: model.bodyType, skinTone: model.skinTone, ageRange: model.ageRange, backdrop, seed },
      category: analysis.category,
      baseModelImage,
      timeoutMs: 60_000,
    });
    const exact = await checkPersonOutput(person);
    const verdict = exact.pass ? await vision.assessOutput({ garmentImage: image, outputImage: person.image, analysis }) : exactMatchVerdict(exact);
    const finished = await finishOutput(person.image, { watermarkText: "Vastra Studio · preview", provenance: provenance("mock-person", "exact") });
    await save("05-exact-output.jpg", finished.image);
    console.log(`exact route: ${Math.round(performance.now() - t)} ms, placement=${JSON.stringify(person.placement)}, exact-match ${exact.pass ? "pass" : "FAIL"} ΔE=${exact.meanDeltaE.toFixed(2)} ssim=${exact.ssim?.toFixed(3)}, gate ${verdict.pass ? "pass" : "fail"} score=${verdict.score} ${verdict.reasons.join("; ")}`);
  } else {
    console.log("exact route skipped: no cut-out");
  }

  // Try-on route with the same cut-out on a neutral card.
  t = performance.now();
  const tryon = await new MockTryOnProvider().generate({
    modelImage: baseModelImage,
    garmentImage: prepared.garmentForTryOn,
    category: analysis.category,
    garmentPhotoType: "flat-lay",
    seed,
    quality: "quality",
    timeoutMs: 60_000,
  });
  const exactTryOn = await checkTryOnOutput(tryon.image, prepared);
  const verdictTryOn = exactTryOn && !exactTryOn.pass ? exactMatchVerdict(exactTryOn) : await vision.assessOutput({ garmentImage: image, outputImage: tryon.image, analysis });
  const finishedTryOn = await finishOutput(tryon.image, { watermarkText: "Vastra Studio · preview", provenance: provenance("mock", "tryon") });
  await save("06-tryon-output.jpg", finishedTryOn.image);
  console.log(
    `try-on route: ${Math.round(performance.now() - t)} ms, exact-match ${exactTryOn ? (exactTryOn.pass ? "pass" : "FAIL") : "skipped"}${exactTryOn ? ` ΔE=${exactTryOn.meanDeltaE.toFixed(2)} matched=${exactTryOn.matchedFraction?.toFixed(2)}` : ""}, gate ${verdictTryOn.pass ? "pass" : "fail"} score=${verdictTryOn.score} ${verdictTryOn.reasons.join("; ")}`,
  );

  console.log(`outputs: ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
