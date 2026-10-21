import "server-only";
import path from "node:path";
import { promises as fs } from "node:fs";
import { getStorage, keys } from "@/lib/storage";
import { getVision } from "@/lib/providers/vision";
import { generateWithFailover, TryOnProviderError } from "@/lib/providers/tryon";
import { getBaseModel } from "@/lib/base-models/catalog";
import { renderBaseModelPng } from "@/lib/base-models/render";
import { finishOutput, makeThumb } from "@/lib/images";
import { newId } from "@/lib/ids";
import { getGarment, setGarmentAnalysis, setGarmentStatus } from "@/lib/dal/garments";
import { getJobForWorker, insertImage, setJobProgress, updateJob } from "@/lib/dal/jobs";
import { creditTenant, getTenantSettings } from "@/lib/dal/tenants";
import { getQueue, type JobPayload } from "@/lib/queue";
import { env } from "@/env";
import type { GarmentAnalysis } from "@/lib/db/schema";

const PROVIDER_TIMEOUT_MS = 90_000;
const MAX_RETRIES_PER_IMAGE = 1;

export async function handleJob(payload: JobPayload): Promise<void> {
  if (payload.type === "analyze") return runAnalyze(payload.tenantId, payload.garmentId);
  return runGenerate(payload.jobId);
}

/* ---------------------------- analysis ---------------------------- */

async function runAnalyze(tenantId: string, garmentId: string): Promise<void> {
  const garment = await getGarment(tenantId, garmentId);
  if (!garment) return;
  await setGarmentStatus(tenantId, garmentId, "analysing");
  try {
    const image = await getStorage().get(garment.originalKey);
    const analysis = await getVision().analyzeGarment(image);
    await setGarmentAnalysis(tenantId, garmentId, analysis);
  } catch (err) {
    console.error(`[analyze] ${garmentId} failed:`, err);
    // Analysis is best-effort; the owner can still generate.
    await setGarmentStatus(tenantId, garmentId, "ready");
  }
}

/* --------------------------- generation --------------------------- */

async function loadBaseModelImage(baseModelId: string, backdropId: string): Promise<Buffer> {
  const model = getBaseModel(baseModelId);
  if (!model) throw new Error(`Unknown base model ${baseModelId}`);
  // Production: a reviewed photoreal render per model x backdrop lives in storage.
  const key = `library/${model.id}/${backdropId}.jpg`;
  const storage = getStorage();
  if (await storage.exists(key)) return storage.get(key);
  // Development: render the placeholder on demand and cache it.
  const cacheDir = path.resolve(".data/cache/base-models");
  const cachePath = path.join(cacheDir, `${model.id}--${backdropId}.png`);
  try {
    return await fs.readFile(cachePath);
  } catch {
    const png = await renderBaseModelPng(model, backdropId);
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cachePath, png);
    return png;
  }
}

async function runGenerate(jobId: string): Promise<void> {
  const job = await getJobForWorker(jobId);
  if (!job || !["queued", "generating", "finishing", "gating", "analysing"].includes(job.status)) return;
  const tenantId = job.tenantId;
  const garment = job.garment;
  const storage = getStorage();
  const vision = getVision();

  await updateJob(jobId, { status: "generating", progress: 5, statusMessage: "Preparing the model", startedAt: job.startedAt ?? new Date() });

  let completed = 0;
  let failedImages = 0;
  try {
    const [garmentImage, modelImage, settings] = await Promise.all([
      storage.get(garment.originalKey),
      loadBaseModelImage(job.baseModelId, job.backdrop),
      getTenantSettings(tenantId),
    ]);
    const analysis: GarmentAnalysis | null = garment.analysis ?? null;
    const category = analysis?.category ?? (garment.category as GarmentAnalysis["category"]) ?? "unknown";
    const watermark = settings?.watermarkEnabled || settings?.plan === "trial" ? "Vastra Studio · preview" : null;

    for (let i = 0; i < job.variations; i++) {
      let attempt = 0;
      let seed = Math.floor(Math.random() * 2_147_483_647);
      let stored = false;
      while (attempt <= MAX_RETRIES_PER_IMAGE && !stored) {
        const pct = Math.round(10 + ((i + attempt * 0.4) / job.variations) * 70);
        await setJobProgress(jobId, "generating", pct, `Dressing the model · image ${i + 1} of ${job.variations}${attempt ? " (retry)" : ""}`);

        const output = await generateWithFailover({
          modelImage,
          garmentImage,
          category,
          garmentPhotoType: "auto",
          seed,
          quality: "quality", // fidelity over speed: prints, zari and dupatta detail must survive
          timeoutMs: PROVIDER_TIMEOUT_MS,
        });
        await updateJob(jobId, { provider: output.provider });

        await setJobProgress(jobId, "gating", Math.min(95, pct + 10), `Checking quality · image ${i + 1}`);
        const verdict = await vision.assessOutput({ garmentImage, outputImage: output.image, analysis });

        if (!verdict.pass && attempt < MAX_RETRIES_PER_IMAGE) {
          attempt++;
          seed = Math.floor(Math.random() * 2_147_483_647);
          await updateJob(jobId, { retryCount: (job.retryCount ?? 0) + attempt });
          continue;
        }

        if (verdict.pass) {
          await setJobProgress(jobId, "finishing", Math.min(97, pct + 15), `Finishing · image ${i + 1}`);
          const imageId = newId("img");
          const provenance = {
            generator: "Vastra Studio",
            provider: output.provider,
            jobId,
            imageId,
            seed: output.seed,
            generatedAt: new Date().toISOString(),
            synthetic: true as const,
          };
          const finished = await finishOutput(output.image, { watermarkText: watermark, provenance });
          const thumb = await makeThumb(finished.image);
          const storageKey = keys.output(tenantId, jobId, imageId);
          const thumbKey = keys.outputThumb(tenantId, jobId, imageId);
          await storage.put(storageKey, finished.image, "image/jpeg");
          await storage.put(thumbKey, thumb, "image/jpeg");
          await insertImage({
            id: imageId,
            jobId,
            tenantId,
            garmentId: garment.id,
            storageKey,
            thumbKey,
            width: finished.width,
            height: finished.height,
            provider: output.provider,
            seed: output.seed,
            qualityScore: verdict.score,
            gateVerdict: verdict,
            provenance,
          });
          completed++;
        } else {
          failedImages++;
        }
        stored = true;
      }
    }

    // Refund the share of credits for images that never passed the gate.
    const perImage = Math.floor(job.creditsCharged / job.variations);
    const refund = failedImages * perImage;
    if (refund > 0) {
      await creditTenant({ tenantId, amount: refund, reason: "refund", jobId, note: `${failedImages} image(s) failed the quality gate`, actorId: null });
    }

    const status = completed === 0 ? "failed" : failedImages > 0 ? "partially_completed" : "completed";
    await updateJob(jobId, {
      status,
      progress: 100,
      statusMessage: status === "failed" ? "No image passed the quality gate. Credits refunded." : status === "partially_completed" ? `${completed} of ${job.variations} images passed` : "Done",
      creditsRefunded: refund,
      finishedAt: new Date(),
      error: status === "failed" ? "quality_gate" : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[generate] ${jobId} failed:`, message);
    const nonRetryable = err instanceof TryOnProviderError && !err.retryable;
    // Full refund minus images already delivered.
    const perImage = Math.floor(job.creditsCharged / job.variations);
    const refund = Math.max(0, job.creditsCharged - completed * perImage);
    if (refund > 0) {
      await creditTenant({ tenantId, amount: refund, reason: "refund", jobId, note: "Generation failed", actorId: null });
    }
    await updateJob(jobId, {
      status: completed > 0 ? "partially_completed" : "failed",
      progress: 100,
      statusMessage: nonRetryable ? friendlyProviderMessage(message) : "Something went wrong while generating. Your credits were refunded.",
      creditsRefunded: refund,
      error: message.slice(0, 500),
      finishedAt: new Date(),
    });
  }
}

function friendlyProviderMessage(message: string): string {
  if (/moderation|safety|nsfw/i.test(message)) return "The provider declined this image for safety reasons. Credits refunded.";
  if (/No try-on provider/i.test(message)) return "Generation is temporarily unavailable. Credits refunded.";
  return "The provider could not process this garment photo. Try a clearer photo. Credits refunded.";
}

/* ----------------------------- worker ----------------------------- */

declare global {
   
  var __vastraWorkerStarted: boolean | undefined;
}

/** Start consuming jobs in this process. Idempotent. */
export async function startWorker(concurrency = 2): Promise<void> {
  if (globalThis.__vastraWorkerStarted) return;
  globalThis.__vastraWorkerStarted = true;
  const queue = getQueue();
  await queue.start(handleJob, concurrency);
  // Recover anything that was in flight when the last process stopped.
  if (!env.REDIS_URL) {
    const { listUnfinishedJobIds } = await import("@/lib/dal/jobs");
    const ids = await listUnfinishedJobIds();
    for (const id of ids) {
      const job = await getJobForWorker(id);
      if (job) await queue.enqueue({ type: "generate", tenantId: job.tenantId, jobId: id });
    }
    if (ids.length) console.log(`[worker] re-queued ${ids.length} unfinished job(s)`);
  }
}
