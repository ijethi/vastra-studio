"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Download, Heart, RefreshCw, Share2, Sparkles, SlidersHorizontal } from "lucide-react";
import { Collapsible } from "radix-ui";
import type { BaseModel, Backdrop, BodyType, SkinTone, AgeRange } from "@/lib/base-models/catalog";
import { BODY_TYPES, SKIN_TONES, AGE_RANGES } from "@/lib/base-models/catalog";
import { Button } from "@/components/ui/button";
import { Card, Progress, Alert, Spinner, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { Uploader, putWithProgress } from "./uploader";
import { requestUploadUrl, registerGarment } from "@/app/actions/garments";
import { createGenerationJob, acceptImageAction } from "@/app/actions/jobs";
import { getGarmentSummary, type GarmentSummary } from "@/app/actions/studio";
import type { JobEvent } from "@/app/api/jobs/[id]/events/route";
import { cn } from "@/lib/cn";
import { creditsForRun } from "@/lib/dal/pricing";

type Props = {
  baseModels: BaseModel[];
  backdrops: Backdrop[];
  defaults: { baseModelId: string; backdrop: string; variations: number; autoGenerate: boolean };
  credits: number;
  initialGarment: GarmentSummary | null;
  boutiqueName: string;
};

type Phase = "upload" | "preparing" | "confirm" | "generating";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function StudioWorkbench({ baseModels, backdrops, defaults, credits: initialCredits, initialGarment, boutiqueName }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [phase, setPhase] = React.useState<Phase>(initialGarment ? "confirm" : "upload");
  const [garment, setGarment] = React.useState<GarmentSummary | null>(initialGarment);
  const [baseModelId, setBaseModelId] = React.useState(defaults.baseModelId);
  const [backdrop, setBackdrop] = React.useState(defaults.backdrop);
  const [variations, setVariations] = React.useState(defaults.variations);
  const [credits, setCredits] = React.useState(initialCredits);
  const [job, setJob] = React.useState<JobEvent | null>(null);
  const [status, setStatus] = React.useState<string>("");
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const idemRef = React.useRef<string>(crypto.randomUUID());

  const cost = creditsForRun(variations);
  const model = baseModels.find((m) => m.id === baseModelId) ?? baseModels[0];
  const background = backdrops.find((b) => b.id === backdrop) ?? backdrops[0];

  /* ---------------- live job updates ---------------- */
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

  /* ---------------- helpers ---------------- */

  async function uploadOne(file: File, label?: string): Promise<GarmentSummary | null> {
    setStatus(label ? `Uploading ${label}` : "Uploading your photo");
    setProgress(0);
    const signed = await requestUploadUrl({ contentType: file.type || "image/heic", size: file.size });
    if (!signed.ok) throw new Error(signed.error);
    await putWithProgress(signed.data.url, file, signed.data.headers, setProgress);
    setStatus("Checking the photo");
    const reg = await registerGarment(signed.data.uploadId);
    if (!reg.ok) throw new Error(reg.error);
    return getGarmentSummary(reg.data.garmentId);
  }

  /** Wait briefly for the garment check so unusable photos are caught before credits are spent. */
  async function waitForCheck(g: GarmentSummary, maxMs = 20_000): Promise<GarmentSummary> {
    const started = Date.now();
    let current = g;
    while ((current.status === "uploaded" || current.status === "analysing") && Date.now() - started < maxMs) {
      await sleep(1200);
      current = (await getGarmentSummary(current.id)) ?? current;
      setGarment(current);
    }
    return current;
  }

  async function startJob(g: GarmentSummary): Promise<boolean> {
    setSubmitting(true);
    setError(null);
    const res = await createGenerationJob({ garmentId: g.id, baseModelId, backdrop, variations, idempotencyKey: idemRef.current });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    idemRef.current = crypto.randomUUID();
    setCredits((c) => c - res.data.credits);
    setJob({ id: res.data.jobId, status: "queued", progress: 0, statusMessage: "Starting", images: [], creditsRefunded: 0, done: false });
    setPhase("generating");
    return true;
  }

  /* ---------------- entry: files chosen ---------------- */

  async function handleFiles(files: File[]) {
    setError(null);
    if (files.length > 1) return handleBatch(files);
    setPhase("preparing");
    try {
      const g = await uploadOne(files[0]);
      if (!g) throw new Error("Upload did not complete. Please try again.");
      setGarment(g);
      const checked = await waitForCheck(g);
      const canAuto = defaults.autoGenerate && checked.status !== "unusable" && credits >= cost;
      if (canAuto) {
        setStatus("Making your photo");
        const ok = await startJob(checked);
        if (!ok) setPhase("confirm");
      } else {
        setPhase("confirm");
      }
    } catch (err) {
      setError((err as Error).message);
      setPhase(garment ? "confirm" : "upload");
    }
  }

  async function handleBatch(files: File[]) {
    setPhase("preparing");
    let made = 0;
    let failed = 0;
    let spent = 0;
    for (let i = 0; i < files.length; i++) {
      try {
        const g = await uploadOne(files[i], `photo ${i + 1} of ${files.length}`);
        if (!g) throw new Error("upload failed");
        if (defaults.autoGenerate && credits - spent >= cost) {
          const res = await createGenerationJob({ garmentId: g.id, baseModelId, backdrop, variations, idempotencyKey: crypto.randomUUID() });
          if (res.ok) {
            spent += res.data.credits;
            made++;
          } else failed++;
        }
      } catch {
        failed++;
      }
    }
    setCredits((c) => c - spent);
    toast.push({
      title: made ? `Making ${made} ${made === 1 ? "photo" : "photos"}` : "Photos added to your gallery",
      body: failed ? `${failed} could not be started. Open them from the gallery to retry.` : "Watch them finish in the gallery.",
      tone: failed ? "neutral" : "success",
    });
    router.push("/gallery");
    router.refresh();
  }

  function startOver() {
    setJob(null);
    setGarment(null);
    setError(null);
    setPhase("upload");
  }

  /* ---------------- render ---------------- */

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">{boutiqueName}</p>
          <h1 className="display-lg">Studio</h1>
        </div>
        {phase !== "upload" && phase !== "preparing" ? (
          <Button variant="secondary" size="sm" onClick={startOver}>
            <Sparkles className="h-4 w-4" aria-hidden="true" /> New photo
          </Button>
        ) : null}
      </header>

      {phase === "upload" ? <Uploader onFiles={handleFiles} /> : null}

      {phase === "preparing" ? (
        <Card className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center fade-up">
          {garment ? (
            <div className="image-frame mb-6 h-48 w-36">
              <Image src={garment.thumbUrl} alt="" width={288} height={384} unoptimized className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Spinner className="h-6 w-6" />
            </div>
          )}
          <h2 className="text-2xl">{status || "Working"}</h2>
          <div className="mt-4 w-full max-w-xs">
            <Progress value={status.startsWith("Uploading") ? progress : 100} label={status} />
          </div>
          <p className="mt-3 text-sm text-ink-2">A few seconds</p>
        </Card>
      ) : null}

      {phase === "confirm" && garment ? (
        <section className="grid gap-6 lg:grid-cols-[1fr_1fr] fade-up">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-2">
              <div className="image-frame aspect-[3/4] rounded-none">
                <Image src={garment.thumbUrl} alt={garment.title} width={480} height={640} unoptimized className="h-full w-full object-cover" />
                <span className="absolute left-2 top-2 rounded-full bg-surface/90 px-2 py-0.5 text-[11px] font-medium text-ink-2">Your photo</span>
              </div>
              <div className="image-frame aspect-[3/4] rounded-none">
                <Image key={model.id} src={model.imagePath} alt={model.label} width={480} height={720} className="h-full w-full object-cover fade-up" />
                <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-on-accent">Your model</span>
              </div>
            </div>
            <div className="space-y-2 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl">{garment.title}</h2>
                <GarmentBadge status={garment.status} />
              </div>
              <p className="text-sm text-ink-2">
                {model.label} · {background.label} · {variations} {variations === 1 ? "version" : "versions"}
              </p>
              {garment.analysis?.issues?.length ? (
                <Alert tone={garment.status === "unusable" ? "danger" : "warning"} title={garment.status === "unusable" ? "This photo will not work" : "For a better result"}>
                  <ul className="list-disc pl-4">
                    {garment.analysis.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
            </div>
          </Card>

          <div className="space-y-4">
            <p className="eyebrow">Step 2 of 2</p>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {garment.status !== "unusable" && credits < cost ? (
              <Alert tone="warning" title="Not enough credits">
                This needs {cost} credits and you have {credits}. <Link href="/billing" className="underline">Add credits</Link> to continue.
              </Alert>
            ) : null}
            {garment.status === "unusable" ? (
              <Button size="lg" className="w-full" onClick={startOver}>
                Try another photo
              </Button>
            ) : (
              <Button size="lg" className="w-full shadow-[var(--shadow-lg)]" disabled={submitting || credits < cost || garment.status === "uploaded" || garment.status === "analysing"} onClick={() => startJob(garment)}>
                {submitting ? <Spinner /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                Make the photo · {cost} credits
              </Button>
            )}
            <OptionsPanel
              open={optionsOpen}
              onOpenChange={setOptionsOpen}
              baseModels={baseModels}
              backdrops={backdrops}
              baseModelId={baseModelId}
              onModel={setBaseModelId}
              backdrop={backdrop}
              onBackdrop={setBackdrop}
              variations={variations}
              onVariations={setVariations}
            />
            <p className="text-center text-xs text-ink-3">Versions that fail our quality check are refunded automatically.</p>
          </div>
        </section>
      ) : null}

      {phase === "generating" && job && garment ? (
        <GenerationView
          job={job}
          garment={garment}
          model={model}
          background={background}
          onAgain={() => startJob(garment)}
          onChange={() => {
            setJob(null);
            setOptionsOpen(true);
            setPhase("confirm");
          }}
          onNew={startOver}
          submitting={submitting}
        />
      ) : null}
    </div>
  );
}

function GarmentBadge({ status }: { status: string }) {
  if (status === "uploaded" || status === "analysing")
    return (
      <Badge tone="neutral">
        <Spinner className="h-3 w-3" /> Checking
      </Badge>
    );
  if (status === "unusable") return <Badge tone="danger">Needs a better photo</Badge>;
  return (
    <Badge tone="success">
      <Check className="h-3 w-3" aria-hidden="true" /> Ready
    </Badge>
  );
}

/* ----------------------------- options ----------------------------- */

function OptionsPanel(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  baseModels: BaseModel[];
  backdrops: Backdrop[];
  baseModelId: string;
  onModel: (id: string) => void;
  backdrop: string;
  onBackdrop: (id: string) => void;
  variations: number;
  onVariations: (n: number) => void;
}) {
  const { open, onOpenChange, baseModels, backdrops, baseModelId, onModel, backdrop, onBackdrop, variations, onVariations } = props;
  const current = baseModels.find((m) => m.id === baseModelId) ?? baseModels[0];
  const [bodyType, setBodyType] = React.useState<BodyType>(current.bodyType);
  const [skinTone, setSkinTone] = React.useState<SkinTone>(current.skinTone);
  const [ageRange, setAgeRange] = React.useState<AgeRange>(current.ageRange);

  React.useEffect(() => {
    const match = baseModels.find((m) => m.bodyType === bodyType && m.skinTone === skinTone && m.ageRange === ageRange) ?? baseModels.find((m) => m.bodyType === bodyType && m.skinTone === skinTone);
    if (match && match.id !== baseModelId) onModel(match.id);
  }, [bodyType, skinTone, ageRange]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange} className="card">
      <Collapsible.Trigger className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <SlidersHorizontal className="h-4 w-4 text-ink-2" aria-hidden="true" /> Change model, background or number of versions
        </span>
        <ChevronDown className={cn("h-4 w-4 text-ink-2 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </Collapsible.Trigger>
      <Collapsible.Content className="space-y-6 border-t border-line px-5 pb-5 pt-4">
        <div>
          <h3 className="text-base font-medium">Model</h3>
          <div className="mt-3 space-y-3">
            <ChipGroup label="Body" options={Object.entries(BODY_TYPES).map(([k, v]) => ({ value: k, label: v }))} value={bodyType} onChange={(v) => setBodyType(v as BodyType)} />
            <ChipGroup label="Skin" options={Object.entries(SKIN_TONES).map(([k, v]) => ({ value: k, label: v.label, swatch: v.hex }))} value={skinTone} onChange={(v) => setSkinTone(v as SkinTone)} />
            <ChipGroup label="Age" options={Object.entries(AGE_RANGES).map(([k, v]) => ({ value: k, label: v }))} value={ageRange} onChange={(v) => setAgeRange(v as AgeRange)} />
          </div>
        </div>
        <div>
          <h3 className="text-base font-medium">Background</h3>
          <div className="no-scrollbar -mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Background">
            {backdrops.map((b) => (
              <button key={b.id} type="button" role="radio" aria-checked={backdrop === b.id} onClick={() => onBackdrop(b.id)} className={cn("w-24 shrink-0 text-left", backdrop === b.id ? "" : "opacity-80 hover:opacity-100")}>
                <span className={cn("block h-14 rounded-xl border-2 transition-colors", backdrop === b.id ? "border-accent" : "border-transparent")} style={{ background: `linear-gradient(160deg, ${b.hex}, ${b.hex}cc)` }} aria-hidden="true" />
                <span className="mt-1.5 block text-xs font-medium text-ink">{b.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-base font-medium">How many versions</h3>
          <p className="mt-1 text-xs text-ink-2">2 is 25 credits; each extra one is 10.</p>
          <div className="mt-3 flex gap-2" role="radiogroup" aria-label="How many versions">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={variations === n} onClick={() => onVariations(n)} className={cn("h-11 w-14 rounded-[var(--radius-control)] border text-sm font-medium transition-colors", variations === n ? "border-accent bg-accent-soft text-accent" : "border-line-strong bg-surface text-ink-2 hover:text-ink")}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-ink-3">
          Want this every time? Save it as your house look in <Link href="/settings" className="underline">Settings</Link>.
        </p>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function ChipGroup({ label, options, value, onChange }: { label: string; options: Array<{ value: string; label: string; swatch?: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-10 text-xs font-medium text-ink-2">{label}</span>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors", value === o.value ? "border-accent bg-accent-soft text-accent" : "border-line-strong bg-surface text-ink-2 hover:text-ink")}>
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
  background,
  onAgain,
  onChange,
  onNew,
  submitting,
}: {
  job: JobEvent;
  garment: GarmentSummary;
  model: BaseModel;
  background: Backdrop;
  onAgain: () => void;
  onChange: () => void;
  onNew: () => void;
  submitting: boolean;
}) {
  const failed = job.done && job.images.length === 0;
  const slots = job.done ? job.images.length : Math.max(job.images.length + 1, 1);

  return (
    <section className="space-y-6 fade-up">
      <Card className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <div className="image-frame h-16 w-12 shrink-0">
          <Image src={garment.thumbUrl} alt="" width={96} height={128} unoptimized className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-medium text-ink">{garment.title}</h2>
          <p className="truncate text-xs text-ink-2">
            {model.label} · {background.label}
          </p>
          {!job.done ? (
            <div className="mt-2">
              <Progress value={job.progress} label="Progress" />
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
      </Card>

      {failed ? (
        <Alert tone="danger" title="We could not make a good photo from this">
          Your credits were refunded. A clearer, well-lit photo of the single garment usually fixes it.
        </Alert>
      ) : null}

      {!job.done && job.images.length === 0 ? <p className="text-center text-sm text-ink-2">You can leave this page. Finished photos appear in your gallery.</p> : null}

      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
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
            <li key={img.id} className="fade-up">
              <ResultCard image={img} alt={`${garment.title} on model, variation ${i + 1}`} title={garment.title} />
            </li>
          );
        })}
      </ul>

      {job.done ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Button size="lg" onClick={onNew}>
            <Sparkles className="h-4 w-4" aria-hidden="true" /> Next garment
          </Button>
          <Button size="lg" variant="secondary" onClick={onAgain} disabled={submitting}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Make again
          </Button>
          <Button size="lg" variant="secondary" onClick={onChange}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Different model
          </Button>
        </div>
      ) : null}

      {job.done && job.images.length ? (
        <p className="text-center text-sm text-ink-2">
          All sizes and every past photo live in your <Link href={`/gallery/${garment.id}`} className="underline">gallery</Link>.
        </p>
      ) : null}
    </section>
  );
}

export function ResultCard({ image, alt, title }: { image: JobEvent["images"][number]; alt: string; title: string }) {
  const toast = useToast();
  const [loved, setLoved] = React.useState(image.accepted);
  const [sharing, setSharing] = React.useState(false);

  async function share() {
    setSharing(true);
    try {
      const res = await fetch(`/api/images/${image.id}/download?size=ig-portrait`);
      const blob = await res.blob();
      const file = new File([blob], `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "vastra"}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        toast.push({ title: "Saved to your downloads", body: "Attach it in WhatsApp or Instagram.", tone: "success" });
      }
    } catch {
      /* user cancelled the share sheet */
    } finally {
      setSharing(false);
    }
  }

  return (
    <figure>
      <div className="image-frame aspect-[2/3]">
        <Image src={image.url} alt={alt} width={image.width} height={image.height} unoptimized className="h-full w-full object-cover" />
        <button
          type="button"
          aria-pressed={loved}
          aria-label={loved ? "Remove from favourites" : "Save to favourites"}
          onClick={async () => {
            const next = !loved;
            setLoved(next);
            const res = await acceptImageAction(image.id, next);
            if (!res.ok) setLoved(!next);
          }}
          className={cn("absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-surface/90 shadow transition-colors", loved ? "text-accent" : "text-ink-2 hover:text-ink")}
        >
          <Heart className={cn("h-4 w-4", loved && "fill-current")} aria-hidden="true" />
        </button>
      </div>
      <figcaption className="mt-2 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={share} disabled={sharing}>
          {sharing ? <Spinner /> : <Share2 className="h-4 w-4" aria-hidden="true" />} Share
        </Button>
        <Button asChild size="sm" variant="secondary">
          <a href={`/api/images/${image.id}/download?size=ig-portrait`}>
            <Download className="h-4 w-4" aria-hidden="true" /> Save
          </a>
        </Button>
      </figcaption>
    </figure>
  );
}
