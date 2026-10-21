"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Download, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import type { BaseModel, Backdrop, BodyType, SkinTone, AgeRange } from "@/lib/base-models/catalog";
import { BODY_TYPES, SKIN_TONES, AGE_RANGES } from "@/lib/base-models/catalog";
import { Button } from "@/components/ui/button";
import { Badge, Card, Progress, Alert, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { Uploader } from "./uploader";
import { createGenerationJob, acceptImageAction } from "@/app/actions/jobs";
import { getGarmentSummary, type GarmentSummary } from "@/app/actions/studio";
import type { JobEvent } from "@/app/api/jobs/[id]/events/route";
import { cn } from "@/lib/cn";
import { creditsForRun } from "@/lib/dal/pricing";

type Props = {
  baseModels: BaseModel[];
  backdrops: Backdrop[];
  defaults: { baseModelId: string; backdrop: string; variations: number };
  credits: number;
  initialGarment: GarmentSummary | null;
  recentGarments: Array<{ id: string; title: string; thumbUrl: string }>;
  boutiqueName: string;
};

export function StudioWorkbench({ baseModels, backdrops, defaults, credits: initialCredits, initialGarment, recentGarments, boutiqueName }: Props) {
  const router = useRouter();
  const [garment, setGarment] = React.useState<GarmentSummary | null>(initialGarment);
  const [baseModelId, setBaseModelId] = React.useState(defaults.baseModelId);
  const [backdrop, setBackdrop] = React.useState(defaults.backdrop);
  const [variations, setVariations] = React.useState(defaults.variations);
  const [credits, setCredits] = React.useState(initialCredits);
  const [job, setJob] = React.useState<JobEvent | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [compare, setCompare] = React.useState(false);
  const idemRef = React.useRef<string>(crypto.randomUUID());

  // Poll analysis until the garment is ready or flagged.
  React.useEffect(() => {
    if (!garment || (garment.status !== "uploaded" && garment.status !== "analysing")) return;
    let cancelled = false;
    const t = setInterval(async () => {
      const g = await getGarmentSummary(garment.id);
      if (cancelled || !g) return;
      setGarment(g);
      if (g.status !== "uploaded" && g.status !== "analysing") clearInterval(t);
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [garment?.id, garment?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live job updates.
  React.useEffect(() => {
    if (!job || job.done) return;
    const es = new EventSource(`/api/jobs/${job.id}/events`);
    es.onmessage = (e) => {
      const next = JSON.parse(e.data) as JobEvent;
      setJob(next);
      if (next.done) {
        es.close();
        if (next.creditsRefunded > 0) setCredits((c) => c + next.creditsRefunded);
        router.refresh();
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cost = creditsForRun(variations);
  const canGenerate = garment && garment.status !== "unusable" && garment.status !== "uploaded" && garment.status !== "analysing" && credits >= cost;

  async function generate() {
    if (!garment) return;
    setSubmitting(true);
    setError(null);
    const res = await createGenerationJob({ garmentId: garment.id, baseModelId, backdrop, variations, idempotencyKey: idemRef.current });
    setSubmitting(false);
    if (!res.ok) return setError(res.error);
    idemRef.current = crypto.randomUUID();
    setCredits((c) => c - res.data.credits);
    setJob({ id: res.data.jobId, status: "queued", progress: 0, statusMessage: "Waiting in queue", images: [], creditsRefunded: 0, done: false });
  }

  function reset() {
    setJob(null);
    setCompare(false);
  }

  const model = baseModels.find((m) => m.id === baseModelId);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">{boutiqueName}</p>
          <h1 className="display-lg">Studio</h1>
        </div>
        {garment && !job ? (
          <Button variant="ghost" size="sm" onClick={() => setGarment(null)}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> New garment
          </Button>
        ) : null}
      </header>

      {!garment ? (
        <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <Uploader onReady={(g) => setGarment(g)} />
          {recentGarments.length ? (
            <div>
              <h2 className="text-lg">Or continue with a recent piece</h2>
              <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {recentGarments.map((g) => (
                  <li key={g.id}>
                    <button type="button" onClick={async () => setGarment(await getGarmentSummary(g.id))} className="image-frame block aspect-[3/4] w-full transition-transform hover:scale-[1.02]">
                      <Image src={g.thumbUrl} alt={g.title} width={240} height={320} unoptimized className="h-full w-full object-cover" />
                    </button>
                    <p className="mt-1.5 truncate text-xs text-ink-2">{g.title}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : job ? (
        <GenerationView job={job} garment={garment} model={model} backdrop={backdrops.find((b) => b.id === backdrop)} compare={compare} onCompare={setCompare} onReset={reset} onRegenerate={generate} submitting={submitting} />
      ) : (
        <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <Card className="overflow-hidden">
              <div className="image-frame aspect-[4/5] rounded-none">
                <Image src={garment.thumbUrl} alt={garment.title} width={480} height={600} unoptimized className="h-full w-full object-cover" />
              </div>
              <div className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl">{garment.title}</h2>
                  {garment.status === "analysing" || garment.status === "uploaded" ? (
                    <Badge tone="neutral">
                      <Spinner className="h-3 w-3" /> Reading the garment
                    </Badge>
                  ) : garment.status === "unusable" ? (
                    <Badge tone="danger">Needs a better photo</Badge>
                  ) : (
                    <Badge tone="success">
                      <Check className="h-3 w-3" aria-hidden="true" /> Ready
                    </Badge>
                  )}
                </div>
                {garment.analysis ? (
                  <ul className="flex flex-wrap gap-2 text-xs text-ink-2">
                    <li className="rounded-full bg-surface-2 px-2.5 py-1 capitalize">{garment.analysis.category.replace("-", " ")}</li>
                    {garment.analysis.colour ? <li className="rounded-full bg-surface-2 px-2.5 py-1">{garment.analysis.colour}</li> : null}
                    {garment.analysis.sleeve ? <li className="rounded-full bg-surface-2 px-2.5 py-1">{garment.analysis.sleeve} sleeve</li> : null}
                    {garment.analysis.length ? <li className="rounded-full bg-surface-2 px-2.5 py-1">{garment.analysis.length} length</li> : null}
                    {garment.analysis.print ? <li className="rounded-full bg-surface-2 px-2.5 py-1">{garment.analysis.print}</li> : null}
                  </ul>
                ) : null}
                {garment.analysis?.issues?.length ? (
                  <Alert tone={garment.status === "unusable" ? "danger" : "warning"} title={garment.status === "unusable" ? "We cannot dress a model in this photo" : "Tips for a better result"}>
                    <ul className="list-disc pl-4">
                      {garment.analysis.issues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  </Alert>
                ) : null}
              </div>
            </Card>
          </div>

          <div className="space-y-8">
            <ModelPicker models={baseModels} value={baseModelId} onChange={setBaseModelId} />
            <BackdropPicker backdrops={backdrops} value={backdrop} onChange={setBackdrop} />

            <div>
              <h2 className="text-lg">Variations</h2>
              <p className="mt-1 text-sm text-ink-2">More variations, more to choose from. Each run is checked image by image.</p>
              <div className="mt-3 flex gap-2" role="radiogroup" aria-label="Number of variations">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={variations === n}
                    onClick={() => setVariations(n)}
                    className={cn(
                      "h-11 w-14 rounded-[var(--radius-control)] border text-sm font-medium transition-colors",
                      variations === n ? "border-accent bg-accent-soft text-accent" : "border-line-strong bg-surface text-ink-2 hover:text-ink",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {error ? <Alert tone="danger">{error}</Alert> : null}
            {garment.status !== "unusable" && credits < cost ? (
              <Alert tone="warning" title="Not enough credits">
                This run costs {cost} credits and you have {credits}. <Link href="/billing" className="underline">Top up</Link> to continue.
              </Alert>
            ) : null}

            <div className="sticky bottom-20 z-20 lg:static">
              <Button size="lg" className="w-full shadow-[var(--shadow-lg)]" disabled={!canGenerate || submitting} onClick={generate}>
                {submitting ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                Generate {variations} {variations === 1 ? "image" : "images"} · {cost} credits
              </Button>
              <p className="mt-2 text-center text-xs text-ink-3">Images that fail the quality check are refunded automatically.</p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/* ----------------------------- pickers ----------------------------- */

function ModelPicker({ models, value, onChange }: { models: BaseModel[]; value: string; onChange: (id: string) => void }) {
  const current = models.find((m) => m.id === value) ?? models[0];
  const [bodyType, setBodyType] = React.useState<BodyType>(current.bodyType);
  const [skinTone, setSkinTone] = React.useState<SkinTone>(current.skinTone);
  const [ageRange, setAgeRange] = React.useState<AgeRange>(current.ageRange);

  React.useEffect(() => {
    const match = models.find((m) => m.bodyType === bodyType && m.skinTone === skinTone && m.ageRange === ageRange) ?? models.find((m) => m.bodyType === bodyType && m.skinTone === skinTone);
    if (match && match.id !== value) onChange(match.id);
  }, [bodyType, skinTone, ageRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = models.find((m) => m.id === value) ?? current;

  return (
    <div>
      <h2 className="text-lg">Model</h2>
      <p className="mt-1 text-sm text-ink-2">Library models are AI-generated and rights-clear. Pick the look closest to your customers.</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-[120px_1fr]">
        <div className="image-frame aspect-[2/3] w-[120px]">
          <Image key={selected.id} src={selected.imagePath} alt={selected.label} width={240} height={360} className="h-full w-full object-cover fade-up" />
        </div>
        <div className="space-y-4">
          <ChipGroup label="Body type" options={Object.entries(BODY_TYPES).map(([k, v]) => ({ value: k, label: v }))} value={bodyType} onChange={(v) => setBodyType(v as BodyType)} />
          <ChipGroup
            label="Skin tone"
            options={Object.entries(SKIN_TONES).map(([k, v]) => ({ value: k, label: v.label, swatch: v.hex }))}
            value={skinTone}
            onChange={(v) => setSkinTone(v as SkinTone)}
          />
          <ChipGroup label="Age" options={Object.entries(AGE_RANGES).map(([k, v]) => ({ value: k, label: v }))} value={ageRange} onChange={(v) => setAgeRange(v as AgeRange)} />
        </div>
      </div>
    </div>
  );
}

function BackdropPicker({ backdrops, value, onChange }: { backdrops: Backdrop[]; value: string; onChange: (id: string) => void }) {
  return (
    <div>
      <h2 className="text-lg">Backdrop</h2>
      <div className="no-scrollbar -mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Backdrop">
        {backdrops.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={value === b.id}
            onClick={() => onChange(b.id)}
            className={cn("group w-28 shrink-0 text-left", value === b.id ? "" : "opacity-80 hover:opacity-100")}
          >
            <span
              className={cn("block h-16 rounded-xl border-2 transition-colors", value === b.id ? "border-accent" : "border-transparent")}
              style={{ background: `linear-gradient(160deg, ${b.hex}, ${b.hex}cc)` }}
              aria-hidden="true"
            />
            <span className="mt-1.5 block text-xs font-medium text-ink">{b.label}</span>
            <span className="block text-[11px] text-ink-3">{b.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChipGroup({ label, options, value, onChange }: { label: string; options: Array<{ value: string; label: string; swatch?: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink-2">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
              value === o.value ? "border-accent bg-accent-soft text-accent" : "border-line-strong bg-surface text-ink-2 hover:text-ink",
            )}
          >
            {o.swatch ? <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: o.swatch }} aria-hidden="true" /> : null}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- generation view --------------------------- */

function GenerationView({
  job,
  garment,
  model,
  backdrop,
  compare,
  onCompare,
  onReset,
  onRegenerate,
  submitting,
}: {
  job: JobEvent;
  garment: GarmentSummary;
  model?: BaseModel;
  backdrop?: Backdrop;
  compare: boolean;
  onCompare: (v: boolean) => void;
  onReset: () => void;
  onRegenerate: () => void;
  submitting: boolean;
}) {
  const toast = useToast();
  const failed = job.done && job.images.length === 0;
  const slots = Math.max(job.images.length, job.done ? job.images.length : Math.max(1, job.images.length + 1));

  return (
    <section className="space-y-6 fade-up">
      <Card className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <div className="image-frame h-16 w-12 shrink-0">
          <Image src={garment.thumbUrl} alt="" width={96} height={128} unoptimized className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">{garment.title}</p>
          <p className="truncate text-xs text-ink-2">
            {model?.label} · {backdrop?.label}
          </p>
          {!job.done ? (
            <div className="mt-2">
              <Progress value={job.progress} label="Generation progress" />
              <p className="mt-1.5 text-xs text-ink-2" aria-live="polite">
                {job.statusMessage ?? "Working"} · usually under 90 seconds
              </p>
            </div>
          ) : (
            <p className="mt-1 text-xs text-ink-2" aria-live="polite">
              {job.statusMessage}
            </p>
          )}
        </div>
        {job.done ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onRegenerate} disabled={submitting}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Run again
            </Button>
            <Button variant="ghost" size="sm" onClick={onReset}>
              <Wand2 className="h-4 w-4" aria-hidden="true" /> Change settings
            </Button>
          </div>
        ) : null}
      </Card>

      {failed ? (
        <Alert tone="danger" title="No image passed the quality check">
          Your credits were refunded. A clearer, well-lit photo of the single garment usually fixes this. Try a different model or backdrop too.
        </Alert>
      ) : null}

      {job.images.length ? (
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Results</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={compare} onChange={(e) => onCompare(e.target.checked)} />
            Compare with the garment photo
          </label>
        </div>
      ) : null}

      <ul className={cn("grid gap-4", compare ? "sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3")}>
        {Array.from({ length: slots }).map((_, i) => {
          const img = job.images[i];
          if (!img) {
            return (
              <li key={`slot-${i}`} className="image-frame aspect-[2/3]">
                <div className="shimmer h-full w-full" />
              </li>
            );
          }
          return (
            <li key={img.id} className={cn("fade-up", compare ? "grid grid-cols-2 gap-3" : "")}>
              {compare ? (
                <div className="image-frame aspect-[2/3]">
                  <Image src={garment.thumbUrl} alt="Garment photo" width={480} height={720} unoptimized className="h-full w-full object-cover" />
                </div>
              ) : null}
              <figure className="group relative">
                <div className="image-frame aspect-[2/3]">
                  <Image src={img.url} alt={`${garment.title} on model, variation ${i + 1}`} width={img.width} height={img.height} unoptimized className="h-full w-full object-cover" />
                </div>
                <figcaption className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-ink-2">Quality {Math.round((img.qualityScore ?? 0) * 100)}%</span>
                  <span className="flex items-center gap-1">
                    <Button
                      variant={img.accepted ? "primary" : "secondary"}
                      size="sm"
                      onClick={async () => {
                        const res = await acceptImageAction(img.id, !img.accepted);
                        if (res.ok) toast.push({ title: img.accepted ? "Removed from favourites" : "Saved to favourites", tone: "success" });
                      }}
                      aria-pressed={img.accepted}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" /> {img.accepted ? "Kept" : "Keep"}
                    </Button>
                    <Button asChild variant="ghost" size="icon" aria-label="Download Instagram size">
                      <a href={`/api/images/${img.id}/download?size=ig-portrait`}>
                        <Download className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </Button>
                  </span>
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>

      {job.done && job.images.length ? (
        <p className="text-sm text-ink-2">
          Find all sizes and share options in the <Link href={`/gallery/${garment.id}`} className="underline">gallery</Link>.
        </p>
      ) : null}
    </section>
  );
}
