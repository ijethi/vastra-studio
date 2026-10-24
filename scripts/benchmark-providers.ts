/**
 * Provider benchmark harness.
 *
 * Runs every configured try-on provider on every (garment photo x base model)
 * pair with a fixed seed, times each call, records the provider's reported
 * cost, runs the vision quality gate on each output and writes everything to
 * ./.data/benchmark/<timestamp>/ (output images + results.json + results.md).
 *
 *   pnpm tsx scripts/benchmark-providers.ts <garment-folder> <base-model-id>[,<id>...] [options]
 *
 * Options:
 *   --providers=mock,gemini,google   override TRYON_PROVIDERS from .env.local
 *   --vision=mock|claude            override VISION_PROVIDER from .env.local
 *   --seed=42                       fixed seed passed to every provider call
 *   --quality=quality|balanced      provider quality mode (default: quality, as in the pipeline)
 *   --category=auto|top|bottom|one-piece|set|saree|lehenga
 *                                   force the garment category instead of using vision analysis
 *   --photo-type=auto|flat-lay|on-model
 *   --backdrop=studio-ivory         backdrop id for the base-model render
 *   --timeout=90000                 per-call ceiling in ms
 *   --limit=N                       only the first N garment photos (sorted by name)
 *   --out=.data/benchmark           parent folder for the run directory
 *
 * The library code is imported directly; the app server is never called and
 * nothing is written to the database. Works offline with TRYON_PROVIDERS=mock
 * and VISION_PROVIDER=mock; GEMINI, Google and Claude are used when their keys
 * are present in .env.local.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import type { GarmentAnalysis, GarmentCategory, GateVerdict } from "../src/lib/db/schema";
import type { TryOnInput, TryOnProvider } from "../src/lib/providers/tryon/types";
import type { VisionProvider } from "../src/lib/providers/vision/types";

/* ----------------------------- env loader ----------------------------- */

/** Minimal .env parser: KEY=VALUE, quotes, `#` comments, no interpolation. Never overrides existing vars. */
async function loadEnvFile(file: string): Promise<boolean> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return false;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    const quoted = value.match(/^(['"])([\s\S]*)\1$/);
    if (quoted) {
      value = quoted[1] === '"' ? quoted[2].replace(/\\n/g, "\n") : quoted[2];
    } else {
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

/* -------------------------------- CLI -------------------------------- */

type Options = {
  garmentDir: string;
  baseModelIds: string[];
  providers: string[] | null;
  vision: "mock" | "claude" | null;
  seed: number;
  quality: "balanced" | "quality";
  category: GarmentCategory | "auto";
  photoType: TryOnInput["garmentPhotoType"];
  backdrop: string;
  timeoutMs: number;
  limit: number | null;
  out: string;
};

const CATEGORIES: ReadonlyArray<GarmentCategory> = ["top", "bottom", "one-piece", "set", "saree", "lehenga", "unknown"];

function usage(): never {
  console.error(
    [
      "Usage: pnpm tsx scripts/benchmark-providers.ts <garment-folder> <base-model-id>[,<id>...] [options]",
      "",
      "Options: --providers=mock,gemini,google  --vision=mock|claude  --seed=42  --quality=quality|balanced",
      "         --category=auto|top|bottom|one-piece|set|saree|lehenga  --photo-type=auto|flat-lay|on-model",
      "         --backdrop=studio-ivory  --timeout=90000  --limit=N  --out=.data/benchmark",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Options {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq < 0) flags.set(arg.slice(2), "true");
      else flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else {
      positional.push(arg);
    }
  }
  if (flags.has("help") || positional.length < 2) usage();

  const quality = flags.get("quality") ?? "quality";
  if (quality !== "quality" && quality !== "balanced") usage();
  const category = flags.get("category") ?? "auto";
  if (category !== "auto" && !CATEGORIES.includes(category as GarmentCategory)) usage();
  const photoType = flags.get("photo-type") ?? "auto";
  if (photoType !== "auto" && photoType !== "flat-lay" && photoType !== "on-model") usage();
  const vision = flags.get("vision") ?? null;
  if (vision !== null && vision !== "mock" && vision !== "claude") usage();

  const seed = Number(flags.get("seed") ?? "42");
  const timeoutMs = Number(flags.get("timeout") ?? "90000");
  const limit = flags.has("limit") ? Number(flags.get("limit")) : null;
  if (!Number.isInteger(seed) || !Number.isInteger(timeoutMs) || (limit !== null && !(limit > 0))) usage();

  return {
    garmentDir: path.resolve(positional[0]),
    baseModelIds: positional
      .slice(1)
      .flatMap((p) => p.split(","))
      .map((s) => s.trim())
      .filter(Boolean),
    providers: flags.has("providers") ? flags.get("providers")!.split(",").map((s) => s.trim()).filter(Boolean) : null,
    vision,
    seed,
    quality,
    category: category as GarmentCategory | "auto",
    photoType,
    backdrop: flags.get("backdrop") ?? "studio-ivory",
    timeoutMs,
    limit,
    out: path.resolve(flags.get("out") ?? ".data/benchmark"),
  };
}

/* ------------------------------ results ------------------------------ */

type RunResult = {
  provider: string;
  garment: string;
  baseModelId: string;
  seed: number;
  ok: boolean;
  error: string | null;
  retryable: boolean | null;
  latencyMs: number;
  costUsd: number | null;
  providerRef: string | null;
  outputFile: string | null;
  width: number | null;
  height: number | null;
  gate: (GateVerdict & { latencyMs: number }) | null;
};

type GarmentRecord = {
  name: string;
  file: string;
  bytes: number;
  category: GarmentCategory;
  categorySource: "flag" | "vision";
  analysis: GarmentAnalysis | null;
  analysisLatencyMs: number | null;
  analysisError: string | null;
};

type ProviderSummary = {
  provider: string;
  runs: number;
  errors: number;
  passed: number;
  passRate: number;
  meanScore: number | null;
  meanLatencyMs: number | null;
  p50LatencyMs: number | null;
  maxLatencyMs: number | null;
  meanGateLatencyMs: number | null;
  totalCostUsd: number;
  costPerPassUsd: number | null;
};

function summarise(provider: string, rows: RunResult[]): ProviderSummary {
  const ok = rows.filter((r) => r.ok);
  const passed = ok.filter((r) => r.gate?.pass);
  const latencies = ok.map((r) => r.latencyMs).sort((a, b) => a - b);
  const scores = ok.map((r) => r.gate?.score).filter((s): s is number => typeof s === "number");
  const gateLat = ok.map((r) => r.gate?.latencyMs).filter((s): s is number => typeof s === "number");
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const totalCost = rows.reduce((a, r) => a + (r.costUsd ?? 0), 0);
  return {
    provider,
    runs: rows.length,
    errors: rows.length - ok.length,
    passed: passed.length,
    passRate: rows.length ? passed.length / rows.length : 0,
    meanScore: mean(scores),
    meanLatencyMs: mean(latencies),
    p50LatencyMs: latencies.length ? latencies[Math.floor((latencies.length - 1) / 2)] : null,
    maxLatencyMs: latencies.length ? latencies[latencies.length - 1] : null,
    meanGateLatencyMs: mean(gateLat),
    totalCostUsd: totalCost,
    costPerPassUsd: passed.length ? totalCost / passed.length : null,
  };
}

const fmtSec = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)} s`);
const fmtUsd = (usd: number | null) => (usd === null ? "–" : `$${usd.toFixed(3)}`);
const fmtScore = (s: number | null | undefined) => (typeof s === "number" ? s.toFixed(2) : "–");
const fmtPct = (x: number) => `${Math.round(x * 100)}%`;
const mdEscape = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function cell(r: RunResult | undefined): string {
  if (!r) return "–";
  if (!r.ok) return `❌ error · ${fmtSec(r.latencyMs)}`;
  const mark = r.gate ? (r.gate.pass ? "✅ pass" : "❌ fail") : "⚠️ no gate";
  return `${mark} · ${fmtScore(r.gate?.score)} · ${fmtSec(r.latencyMs)} · ${fmtUsd(r.costUsd)}`;
}

function renderMarkdown(args: {
  startedAt: Date;
  finishedAt: Date;
  opts: Options;
  providerNames: string[];
  skipped: Array<{ provider: string; reason: string }>;
  visionName: string;
  garments: GarmentRecord[];
  results: RunResult[];
  summaries: ProviderSummary[];
}): string {
  const { startedAt, finishedAt, opts, providerNames, skipped, visionName, garments, results, summaries } = args;
  const lines: string[] = [];
  lines.push(`# Try-on provider benchmark · ${startedAt.toISOString()}`);
  lines.push("");
  lines.push(
    `${garments.length} garment(s) × ${opts.baseModelIds.length} base model(s) × ${providerNames.length} provider(s) = ${results.length} run(s). ` +
      `Seed \`${opts.seed}\`, quality \`${opts.quality}\`, photo type \`${opts.photoType}\`, backdrop \`${opts.backdrop}\`, ` +
      `timeout ${opts.timeoutMs} ms, quality gate \`${visionName}\`. ` +
      `Wall time ${fmtSec(finishedAt.getTime() - startedAt.getTime())}.`,
  );
  lines.push("");
  lines.push("Cost is the provider's own figure from `TryOnOutput.costUsd` (vision-gate cost is not tracked). Latency is the try-on call only; the gate's own latency is in the summary.");
  lines.push("");

  lines.push("## Summary by provider");
  lines.push("");
  lines.push("| Provider | Runs | Errors | Passed | Pass rate | Mean score | Mean latency | p50 | Max | Gate latency | Total cost | Cost per pass |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const s of summaries) {
    lines.push(
      `| ${s.provider} | ${s.runs} | ${s.errors} | ${s.passed} | ${fmtPct(s.passRate)} | ${fmtScore(s.meanScore)} | ${fmtSec(s.meanLatencyMs)} | ${fmtSec(s.p50LatencyMs)} | ${fmtSec(s.maxLatencyMs)} | ${fmtSec(s.meanGateLatencyMs)} | ${fmtUsd(s.totalCostUsd)} | ${fmtUsd(s.costPerPassUsd)} |`,
    );
  }
  lines.push("");

  for (const baseModelId of opts.baseModelIds) {
    lines.push(`## Base model \`${baseModelId}\``);
    lines.push("");
    lines.push("Cell: gate verdict · score · try-on latency · cost.");
    lines.push("");
    lines.push(`| Provider | ${garments.map((g) => mdEscape(g.name)).join(" | ")} |`);
    lines.push(`| --- | ${garments.map(() => "---").join(" | ")} |`);
    for (const provider of providerNames) {
      const cells = garments.map((g) => cell(results.find((r) => r.provider === provider && r.garment === g.name && r.baseModelId === baseModelId)));
      lines.push(`| ${provider} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  lines.push("## Garments");
  lines.push("");
  lines.push("| Garment | Category | Source | Usable | Title | Analysis time |");
  lines.push("| --- | --- | --- | --- | --- | ---: |");
  for (const g of garments) {
    const usable = g.analysis ? (g.analysis.usable ? "yes" : `no (${g.analysis.issues.join("; ")})`) : g.analysisError ? `error: ${g.analysisError}` : "–";
    lines.push(`| ${mdEscape(g.name)} | ${g.category} | ${g.categorySource} | ${mdEscape(usable)} | ${mdEscape(g.analysis?.title ?? "–")} | ${fmtSec(g.analysisLatencyMs)} |`);
  }
  lines.push("");

  const failures = results.filter((r) => !r.ok || (r.gate && !r.gate.pass));
  if (failures.length) {
    lines.push("## Failures and gate rejections");
    lines.push("");
    for (const r of failures) {
      const what = !r.ok ? `provider error${r.retryable ? " (retryable)" : ""}: ${r.error}` : `gate rejected (score ${fmtScore(r.gate?.score)}): ${r.gate?.reasons.join("; ") || "no reason given"}`;
      lines.push(`- **${r.provider}** × ${mdEscape(r.garment)} × ${r.baseModelId}: ${mdEscape(what)}`);
    }
    lines.push("");
  }

  if (skipped.length) {
    lines.push("## Skipped providers");
    lines.push("");
    for (const s of skipped) lines.push(`- **${s.provider}**: ${s.reason}`);
    lines.push("");
  }

  return lines.join("\n");
}

/* -------------------------------- main -------------------------------- */

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  // Load .env.local from the project root (where the script is run) before touching @/env.
  const envFile = path.resolve(process.cwd(), ".env.local");
  const loaded = await loadEnvFile(envFile);
  // @/env validates at import; give the benchmark safe defaults so it also runs without .env.local.
  process.env.AUTH_SECRET ??= "benchmark-only-secret-not-for-the-app-00000000";
  process.env.APP_URL ??= "http://localhost:3000";
  if (opts.providers) process.env.TRYON_PROVIDERS = opts.providers.join(",");
  if (opts.vision) process.env.VISION_PROVIDER = opts.vision;
  // The app pins NODE_ENV; the benchmark just needs it to be one of the allowed values.
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
  }

  // Everything that reads `env` is imported only now.
  const { env, tryOnProviderOrder } = await import("../src/env");
  const { MockTryOnProvider } = await import("../src/lib/providers/tryon/mock");
  const { GeminiTryOnProvider } = await import("../src/lib/providers/tryon/gemini");
  const { GoogleTryOnProvider } = await import("../src/lib/providers/tryon/google");
  const { TryOnProviderError } = await import("../src/lib/providers/tryon/types");
  const { getBaseModel, getBackdrop } = await import("../src/lib/base-models/catalog");
  const { renderBaseModelPng } = await import("../src/lib/base-models/render");

  console.log(loaded ? `Loaded ${envFile}` : `No .env.local found at ${envFile}; using process env and mock defaults`);

  // ---- garments
  let entries: string[];
  try {
    entries = await fs.readdir(opts.garmentDir);
  } catch {
    throw new Error(`Garment folder not found: ${opts.garmentDir}`);
  }
  let garmentFiles = entries.filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort((a, b) => a.localeCompare(b));
  if (opts.limit !== null) garmentFiles = garmentFiles.slice(0, opts.limit);
  if (garmentFiles.length === 0) throw new Error(`No .jpg/.png/.webp garment photos in ${opts.garmentDir}`);

  // ---- base models (same image the pipeline uses: cached render per model x backdrop)
  if (!getBackdrop(opts.backdrop)) throw new Error(`Unknown backdrop ${opts.backdrop}`);
  const baseModelImages = new Map<string, Buffer>();
  for (const id of opts.baseModelIds) {
    const model = getBaseModel(id);
    if (!model) throw new Error(`Unknown base model ${id} (see src/lib/base-models/catalog.ts)`);
    const cacheDir = path.resolve(".data/cache/base-models");
    const cachePath = path.join(cacheDir, `${model.id}--${opts.backdrop}.png`);
    let png: Buffer;
    try {
      png = await fs.readFile(cachePath);
    } catch {
      png = await renderBaseModelPng(model, opts.backdrop);
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(cachePath, png);
    }
    baseModelImages.set(id, png);
  }

  // ---- try-on providers: every configured one, in TRYON_PROVIDERS order
  const registry: Record<string, () => TryOnProvider> = {
    mock: () => new MockTryOnProvider(),
    gemini: () => new GeminiTryOnProvider(),
    google: () => new GoogleTryOnProvider(),
  };
  const requested = opts.providers ?? tryOnProviderOrder;
  const providers: TryOnProvider[] = [];
  const skipped: Array<{ provider: string; reason: string }> = [];
  for (const name of requested) {
    const make = registry[name];
    if (!make) {
      skipped.push({ provider: name, reason: "unknown provider name (expected mock, gemini or google)" });
      continue;
    }
    const p = make();
    if (await p.isAvailable()) providers.push(p);
    else {
      const need = name === "gemini" ? "GEMINI_API_KEY" : name === "google" ? "GOOGLE_CLOUD_PROJECT and GOOGLE_APPLICATION_CREDENTIALS_JSON" : "configuration";
      skipped.push({ provider: name, reason: `not configured (${need} missing in .env.local)` });
    }
  }
  if (providers.length === 0) throw new Error(`No try-on provider is available. Requested: ${requested.join(", ") || "(none)"}`);

  // ---- vision provider (garment analysis + quality gate)
  let vision: VisionProvider;
  if (env.VISION_PROVIDER === "claude" && env.ANTHROPIC_API_KEY) {
    const { ClaudeVisionProvider } = await import("../src/lib/providers/vision/claude");
    vision = new ClaudeVisionProvider();
  } else {
    if (env.VISION_PROVIDER === "claude") console.warn("VISION_PROVIDER=claude but ANTHROPIC_API_KEY is empty; using the mock gate");
    const { MockVisionProvider } = await import("../src/lib/providers/vision/mock");
    vision = new MockVisionProvider();
  }

  // ---- output folder
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const runDir = path.join(opts.out, stamp);
  await fs.mkdir(runDir, { recursive: true });

  console.log(
    `Benchmark: ${garmentFiles.length} garment(s) × ${opts.baseModelIds.length} base model(s) × ${providers.length} provider(s) [${providers.map((p) => p.name).join(", ")}], gate=${vision.name}, seed=${opts.seed}, quality=${opts.quality}`,
  );
  for (const s of skipped) console.log(`  skipping ${s.provider}: ${s.reason}`);
  console.log(`Output: ${runDir}`);

  // ---- garment analysis (the pipeline runs this once per upload)
  const garments: GarmentRecord[] = [];
  const garmentBytes = new Map<string, Buffer>();
  for (const file of garmentFiles) {
    const name = path.parse(file).name;
    const bytes = await fs.readFile(path.join(opts.garmentDir, file));
    garmentBytes.set(name, bytes);
    let analysis: GarmentAnalysis | null = null;
    let analysisError: string | null = null;
    let analysisLatencyMs: number | null = null;
    const t0 = performance.now();
    try {
      analysis = await vision.analyzeGarment(bytes);
    } catch (err) {
      analysisError = err instanceof Error ? err.message : String(err);
    }
    analysisLatencyMs = performance.now() - t0;
    const category: GarmentCategory = opts.category !== "auto" ? opts.category : analysis?.category ?? "unknown";
    garments.push({ name, file, bytes: bytes.length, category, categorySource: opts.category !== "auto" ? "flag" : "vision", analysis, analysisLatencyMs, analysisError });
    console.log(`analysed ${name}: category=${category}${analysis ? ` (${analysis.title}, usable=${analysis.usable})` : analysisError ? ` (analysis failed: ${analysisError})` : ""}`);
  }

  // ---- the runs, sequential so latency numbers are not skewed by contention
  const results: RunResult[] = [];
  const total = providers.length * garments.length * opts.baseModelIds.length;
  let n = 0;
  for (const provider of providers) {
    for (const baseModelId of opts.baseModelIds) {
      const modelImage = baseModelImages.get(baseModelId)!;
      for (const g of garments) {
        n++;
        const label = `[${n}/${total}] ${provider.name} × ${g.name} × ${baseModelId}`;
        const garmentImage = garmentBytes.get(g.name)!;
        const input: TryOnInput = {
          modelImage,
          garmentImage,
          category: g.category,
          garmentPhotoType: opts.photoType,
          seed: opts.seed,
          quality: opts.quality,
          timeoutMs: opts.timeoutMs,
        };
        const row: RunResult = {
          provider: provider.name,
          garment: g.name,
          baseModelId,
          seed: opts.seed,
          ok: false,
          error: null,
          retryable: null,
          latencyMs: 0,
          costUsd: null,
          providerRef: null,
          outputFile: null,
          width: null,
          height: null,
          gate: null,
        };
        const t0 = performance.now();
        try {
          const out = await provider.generate(input);
          row.latencyMs = performance.now() - t0;
          row.ok = true;
          row.costUsd = out.costUsd ?? null;
          row.providerRef = out.providerRef ?? null;
          row.width = out.width;
          row.height = out.height;
          const ext = out.contentType === "image/png" ? "png" : "jpg";
          const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "_");
          row.outputFile = `${safe(provider.name)}__${safe(g.name)}__${safe(baseModelId)}.${ext}`;
          await fs.writeFile(path.join(runDir, row.outputFile), out.image);

          const g0 = performance.now();
          const verdict = await vision.assessOutput({ garmentImage, outputImage: out.image, analysis: g.analysis });
          row.gate = { ...verdict, latencyMs: performance.now() - g0 };
          console.log(`${label}: ${verdict.pass ? "PASS" : "FAIL"} score=${verdict.score.toFixed(2)} latency=${fmtSec(row.latencyMs)} cost=${fmtUsd(row.costUsd)}`);
        } catch (err) {
          row.latencyMs = row.latencyMs || performance.now() - t0;
          row.error = err instanceof Error ? err.message : String(err);
          row.retryable = err instanceof TryOnProviderError ? err.retryable : null;
          console.log(`${label}: ERROR after ${fmtSec(row.latencyMs)}: ${row.error}`);
        }
        results.push(row);
      }
    }
  }

  const finishedAt = new Date();
  const providerNames = providers.map((p) => p.name);
  const summaries = providerNames.map((name) => summarise(name, results.filter((r) => r.provider === name)));

  const json = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    options: { ...opts, garmentDir: opts.garmentDir, out: runDir },
    providers: providerNames,
    skippedProviders: skipped,
    vision: vision.name,
    garments,
    summaries,
    results,
  };
  await fs.writeFile(path.join(runDir, "results.json"), JSON.stringify(json, null, 2));
  const md = renderMarkdown({ startedAt, finishedAt, opts, providerNames, skipped, visionName: vision.name, garments, results, summaries });
  await fs.writeFile(path.join(runDir, "results.md"), md);

  console.log("");
  console.log("Provider      Runs  Errors  Passed  Pass%  Score  Latency(mean/p50/max)  Cost");
  for (const s of summaries) {
    console.log(
      `${s.provider.padEnd(12)}  ${String(s.runs).padStart(4)}  ${String(s.errors).padStart(6)}  ${String(s.passed).padStart(6)}  ${fmtPct(s.passRate).padStart(5)}  ${fmtScore(s.meanScore).padStart(5)}  ${`${fmtSec(s.meanLatencyMs)} / ${fmtSec(s.p50LatencyMs)} / ${fmtSec(s.maxLatencyMs)}`.padEnd(21)}  ${fmtUsd(s.totalCostUsd)}`,
    );
  }
  console.log("");
  console.log(`Wrote ${results.filter((r) => r.outputFile).length} image(s), results.json and results.md to ${runDir}`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
