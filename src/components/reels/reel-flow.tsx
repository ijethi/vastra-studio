"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Clapperboard, Download, RefreshCw, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, Input, Label, Progress, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ShareLinkButton } from "@/components/share/share-dialog";
import { confirmReelSelection, retryReelAnimate, retryReelStills, startReelStills } from "@/app/actions/reels";
import type { ReelEvent, ReelStillEvent } from "@/app/api/reels/[id]/events/route";
import { creditsForClips, creditsForReelStills, REEL_MAX_SELECTION, REEL_STILL_COUNT } from "@/lib/dal/pricing";
import { minSelection, orderForArc, suggestArc } from "@/lib/reels/arc";
import { SHOT_TYPE_LABELS, VIBES } from "@/lib/reels/scenes";
import type { ReelVibe } from "@/lib/db/schema";
import { cn } from "@/lib/cn";

export type ReelSource = { id: string; url: string; width: number; height: number };

type Props = {
  image: ReelSource;
  garment: { id: string; title: string };
  credits: number;
  boutiqueName: string;
  initialReelId?: string | null;
};

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Vibe swatches: a gradient per mood, in the house palette. */
const VIBE_ART: Record<ReelVibe, string> = {
  everyday: "linear-gradient(135deg, #8fb8d8 0%, #eeedea 60%, #ffffff 100%)",
  festive: "linear-gradient(135deg, #e0127a 0%, #ffb000 70%, #fff1cc 100%)",
  editorial: "linear-gradient(135deg, #15121e 0%, #221b38 55%, #8e8a99 100%)",
};

/**
 * Make a reel, phone first: pick a vibe, watch nine scenes sketch in, tap the
 * ones to keep, confirm the clip credits, then play, share and save the reel.
 */
export function ReelFlow({ image, garment, credits: initialCredits, boutiqueName, initialReelId }: Props) {
  const router = useRouter();
  const [reel, setReel] = React.useState<ReelEvent | null>(null);
  const [reelId, setReelId] = React.useState<string | null>(initialReelId ?? null);
  const [credits, setCredits] = React.useState(initialCredits);
  const [vibe, setVibe] = React.useState<ReelVibe>("festive");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const startKey = React.useRef(newKey());
  const confirmKey = React.useRef(newKey());

  // Live snapshots. Re-subscribes whenever the reel moves to a stage the worker owns.
  const status = reel?.status;
  React.useEffect(() => {
    if (!reelId) return;
    if (reel && reel.id === reelId && reel.done) return;
    const es = new EventSource(`/api/reels/${reelId}/events`);
    es.onmessage = (e) => {
      const snap = JSON.parse(e.data) as ReelEvent;
      setReel(snap);
      if (snap.done) {
        es.close();
        router.refresh();
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the status is the resubscribe trigger
  }, [reelId, status]);

  const phase: "vibe" | "stills" | "select" | "animating" | "done" | "failed" = !reelId
    ? "vibe"
    : !reel || reel.id !== reelId
      ? "stills"
      : reel.status === "selecting"
        ? "select"
        : reel.status === "completed" || reel.status === "partially_completed"
          ? "done"
          : reel.status === "failed"
            ? "failed"
            : reel.status === "animating" || reel.status === "assembling"
              ? "animating"
              : "stills";

  async function start(chosen: ReelVibe) {
    setBusy(true);
    setError(null);
    const res = await startReelStills({ imageId: image.id, vibe: chosen, idempotencyKey: startKey.current });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setCredits((c) => c - res.data.credits);
    setReel(null);
    setReelId(res.data.reelId);
    window.history.replaceState(null, "", `/reels/${res.data.reelId}`);
    router.refresh();
  }

  async function confirm(stillIds: string[], caption: string | null) {
    setBusy(true);
    setError(null);
    const res = await confirmReelSelection({ reelId: reelId!, stillIds, caption, idempotencyKey: confirmKey.current });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setCredits((c) => c - res.data.credits);
    setReel((r) => (r ? { ...r, status: "animating", progress: 0, statusMessage: "Waiting in queue", done: false, selectedStillIds: stillIds } : r));
    router.refresh();
  }

  async function retry() {
    if (!reel) return;
    setBusy(true);
    setError(null);
    const key = newKey();
    const res = reel.selectedStillIds.length ? await retryReelAnimate(reel.id, key) : await retryReelStills(reel.id, key);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setCredits((c) => c - res.data.credits);
    if (res.data.reelId !== reel.id) {
      setReel(null);
      setReelId(res.data.reelId);
      window.history.replaceState(null, "", `/reels/${res.data.reelId}`);
    } else {
      setReel((r) => (r ? { ...r, status: "animating", progress: 0, statusMessage: "Waiting in queue", done: false, error: null } : r));
    }
    router.refresh();
  }

  function startOver() {
    startKey.current = newKey();
    confirmKey.current = newKey();
    setReel(null);
    setReelId(null);
    setError(null);
    window.history.replaceState(null, "", `/reels/new?image=${image.id}`);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/gallery/${garment.id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {garment.title}
          </Link>
          <h1 className="display-lg">Make a reel</h1>
        </div>
        <p className="text-sm text-ink-2">
          Balance <span className="font-display text-lg font-bold tabular-nums text-ink">{credits.toLocaleString("en-IN")}</span> credits
        </p>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {phase === "vibe" ? (
        <VibeStep image={image} garment={garment} vibe={vibe} onVibe={setVibe} onStart={() => start(vibe)} busy={busy} credits={credits} />
      ) : null}

      {phase === "stills" ? <StillsStep reel={reel && reel.id === reelId ? reel : null} image={image} resuming={Boolean(initialReelId) && !reel} /> : null}

      {phase === "select" && reel ? <SelectStep key={reel.id} reel={reel} garmentTitle={garment.title} credits={credits} busy={busy} onConfirm={confirm} /> : null}

      {phase === "animating" && reel ? <AnimatingStep reel={reel} /> : null}

      {phase === "done" && reel ? <DoneStep reel={reel} garmentTitle={garment.title} boutiqueName={boutiqueName} onAnother={startOver} /> : null}

      {phase === "failed" && reel ? (
        <section className="space-y-4 fade-up">
          <Alert tone="danger" title="This reel could not be finished">
            {reel.statusMessage ?? "Something went wrong."} {reel.creditsRefunded > 0 ? `${reel.creditsRefunded} credits were refunded.` : ""}
          </Alert>
          <div className="grid gap-3 sm:grid-cols-2">
            {reel.error !== "abandoned" ? (
              <Button size="lg" onClick={retry} disabled={busy}>
                {busy ? <Spinner /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />} Try again
              </Button>
            ) : null}
            <Button size="lg" variant="secondary" onClick={startOver}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Start a new reel
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* ----------------------------- step 1 ----------------------------- */

function VibeStep({
  image,
  garment,
  vibe,
  onVibe,
  onStart,
  busy,
  credits,
}: {
  image: ReelSource;
  garment: { id: string; title: string };
  vibe: ReelVibe;
  onVibe: (v: ReelVibe) => void;
  onStart: () => void;
  busy: boolean;
  credits: number;
}) {
  const price = creditsForReelStills();
  const short = credits < price;
  return (
    <section className="grid gap-6 lg:grid-cols-[260px_1fr] fade-up">
      <Card className="flex items-center gap-4 p-4 lg:flex-col lg:items-stretch lg:p-5">
        <div className="image-frame h-24 w-16 shrink-0 lg:aspect-[2/3] lg:h-auto lg:w-full">
          <Image src={image.url} alt={`${garment.title} on model`} width={image.width} height={image.height} unoptimized className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <p className="eyebrow mb-1">From this look</p>
          <p className="truncate text-sm font-medium text-ink">{garment.title}</p>
          <p className="mt-1 text-xs leading-5 text-ink-2">Nine scenes are sketched from it. Only scenes that keep the garment faithful are shown.</p>
        </div>
      </Card>

      <div className="space-y-5">
        <div>
          <p className="eyebrow mb-3">Choose a vibe</p>
          <div role="radiogroup" aria-label="Vibe" className="grid gap-3 sm:grid-cols-3">
            {VIBES.map((v) => {
              const active = v.id === vibe;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onVibe(v.id)}
                  className={cn(
                    "group relative overflow-hidden rounded-[var(--radius-card)] border text-left transition-[transform,box-shadow,border-color] duration-200 ease-[var(--ease-out-soft)] active:translate-y-px",
                    active ? "border-accent shadow-[0_0_0_4px_var(--accent-soft)]" : "border-line hover:border-line-strong",
                  )}
                >
                  <div className="h-28 w-full sm:h-36" style={{ background: VIBE_ART[v.id] }} aria-hidden="true" />
                  <div className="flex items-start justify-between gap-2 bg-surface p-4">
                    <div>
                      <p className="font-display text-lg font-bold text-ink">{v.label}</p>
                      <p className="mt-0.5 text-xs leading-5 text-ink-2">{v.tagline}</p>
                    </div>
                    <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border", active ? "border-accent bg-accent text-on-accent" : "border-line-strong text-transparent")} aria-hidden="true">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <Card className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="text-sm text-ink-2">
            <p>
              <span className="font-semibold text-ink">{REEL_STILL_COUNT} scene stills</span> · {price} credits now
            </p>
            <p className="mt-0.5 text-xs">Then {creditsForClips(1)} credits per clip you animate, charged when you confirm.</p>
          </div>
          <Button size="lg" onClick={onStart} disabled={busy || short} className="w-full sm:w-auto">
            {busy ? <Spinner /> : <Clapperboard className="h-4 w-4" aria-hidden="true" />} Sketch {REEL_STILL_COUNT} scenes · {price} credits
          </Button>
          {short ? (
            <p className="w-full text-xs text-danger">
              You need {price} credits for the scenes. <Link href="/billing" className="underline">Top up</Link>.
            </p>
          ) : null}
        </Card>
      </div>
    </section>
  );
}

/* ----------------------------- step 2 ----------------------------- */

function StillsStep({ reel, image, resuming }: { reel: ReelEvent | null; image: ReelSource; resuming: boolean }) {
  const stills = reel?.stills ?? [];
  return (
    <section className="space-y-5 fade-up">
      <Card className="flex items-center gap-4 p-4 sm:p-5">
        <div className="image-frame h-16 w-12 shrink-0">
          <Image src={image.url} alt="" width={96} height={144} unoptimized className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-medium text-ink">{resuming ? "Opening your reel" : "Sketching your scenes"}</h2>
          <div className="mt-2">
            <Progress value={reel?.progress ?? 2} label="Progress" />
            <p className="mt-1.5 text-xs text-ink-2" aria-live="polite">
              {resuming ? "One moment" : `${reel?.statusMessage ?? "Waiting in queue"} · usually a minute or two`}
            </p>
          </div>
        </div>
      </Card>
      <StillGrid stills={stills} slots={REEL_STILL_COUNT} />
      <p className="text-center text-sm text-ink-2">You can leave this page. Come back from the gallery when the scenes are ready.</p>
    </section>
  );
}

function StillGrid({ stills, slots, children }: { stills: ReelStillEvent[]; slots: number; children?: (s: ReelStillEvent, i: number) => React.ReactNode }) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Scenes">
      {Array.from({ length: Math.max(slots, stills.length) }).map((_, i) => {
        const s = stills[i];
        if (!s) {
          return (
            <li key={`slot-${i}`} className="image-frame aspect-[9/16]">
              <div className="shimmer h-full w-full" />
            </li>
          );
        }
        return (
          <li key={s.id} className="fade-up">
            {children ? children(s, i) : <StillTile still={s} />}
          </li>
        );
      })}
    </ul>
  );
}

function StillTile({ still }: { still: ReelStillEvent }) {
  return (
    <figure className="image-frame aspect-[9/16]">
      <Image src={still.thumbUrl} alt={still.sceneLabel} width={360} height={640} unoptimized className="h-full w-full object-cover" />
      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent px-2 pb-2 pt-6 text-[11px] font-medium text-white">{still.sceneLabel}</figcaption>
    </figure>
  );
}

/* ----------------------------- step 3 ----------------------------- */

function SelectStep({
  reel,
  garmentTitle,
  credits,
  busy,
  onConfirm,
}: {
  reel: ReelEvent;
  garmentTitle: string;
  credits: number;
  busy: boolean;
  onConfirm: (stillIds: string[], caption: string | null) => void;
}) {
  const stills = reel.stills;
  const [selected, setSelected] = React.useState<string[]>(() => suggestArc(stills, 5).map((s) => s.id));
  const [showTitle, setShowTitle] = React.useState(true);
  const [price, setPrice] = React.useState("");
  const min = minSelection(stills.length);
  const ordered = orderForArc(stills.filter((s) => selected.includes(s.id)));
  const position = new Map(ordered.map((s, i) => [s.id, i + 1]));
  const cost = creditsForClips(ordered.length);
  const short = credits < cost;
  const valid = ordered.length >= min && ordered.length <= REEL_MAX_SELECTION;
  const caption = showTitle ? [garmentTitle, price.trim() ? `₹${price.trim().replace(/^₹\s*/, "")}` : null].filter(Boolean).join(" · ") : null;

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= REEL_MAX_SELECTION) return prev;
      return [...prev, id];
    });
  }

  return (
    <section className="space-y-5 fade-up">
      <div>
        <h2 className="text-2xl">Pick your scenes</h2>
        <p className="mt-1 text-sm text-ink-2" aria-live="polite">
          {reel.statusMessage && reel.statusMessage !== "Pick the scenes for your reel" ? reel.statusMessage + " " : ""}
          Tap {min === REEL_MAX_SELECTION ? `${min}` : `${min} to ${REEL_MAX_SELECTION}`}. The numbers are the playing order: wide, full body, movement, detail, portrait.
        </p>
      </div>

      <StillGrid stills={stills} slots={stills.length}>
        {(s) => {
          const n = position.get(s.id);
          const on = Boolean(n);
          const full = !on && selected.length >= REEL_MAX_SELECTION;
          return (
            <button
              type="button"
              aria-pressed={on}
              aria-label={`${s.sceneLabel}, ${SHOT_TYPE_LABELS[s.shotType]}${on ? `, scene ${n}` : ""}`}
              onClick={() => toggle(s.id)}
              disabled={full}
              className={cn(
                "image-frame block aspect-[9/16] w-full text-left transition-[transform,box-shadow] duration-200 ease-[var(--ease-out-soft)] active:scale-[0.98]",
                on ? "shadow-[0_0_0_3px_var(--accent)]" : full ? "opacity-50" : "hover:shadow-[0_0_0_2px_var(--line-strong)]",
              )}
            >
              <Image src={s.thumbUrl} alt="" width={360} height={640} unoptimized className={cn("h-full w-full object-cover transition-opacity", !on && "opacity-80")} />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent px-2 pb-2 pt-6 text-[11px] font-medium text-white">{s.sceneLabel}</span>
              <span
                className={cn(
                  "absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full font-display text-sm font-bold shadow",
                  on ? "bg-accent text-on-accent" : "bg-surface/85 text-ink-2",
                )}
                aria-hidden="true"
              >
                {on ? n : ""}
              </span>
            </button>
          );
        }}
      </StillGrid>

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="reel-show-title" className="mb-0">
              Show the title on the reel
            </Label>
            <p className="text-xs text-ink-2">A small caption over the clips. The end card always shows your boutique name.</p>
          </div>
          <button
            id="reel-show-title"
            type="button"
            role="switch"
            aria-checked={showTitle}
            onClick={() => setShowTitle((v) => !v)}
            className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", showTitle ? "bg-accent" : "bg-surface-3")}
          >
            <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left]", showTitle ? "left-6" : "left-1")} />
          </button>
        </div>
        {showTitle ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div>
              <Label htmlFor="reel-caption-preview">Caption</Label>
              <Input id="reel-caption-preview" value={caption ?? ""} readOnly aria-readonly className="bg-surface-2" />
            </div>
            <div>
              <Label htmlFor="reel-price">Price (optional)</Label>
              <Input id="reel-price" inputMode="decimal" placeholder="2,499" value={price} onChange={(e) => setPrice(e.target.value)} maxLength={12} />
            </div>
          </div>
        ) : null}
      </Card>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-20 lg:static">
        <Card className="flex flex-wrap items-center justify-between gap-3 p-3 shadow-[var(--shadow-lg)] sm:p-4">
          <p className="text-sm text-ink-2">
            <span className="font-semibold text-ink">
              {ordered.length} clip{ordered.length === 1 ? "" : "s"}
            </span>{" "}
            · 5 s each · {cost} credits
          </p>
          <Button size="lg" onClick={() => onConfirm(ordered.map((s) => s.id), caption)} disabled={busy || !valid || short} className="w-full sm:w-auto">
            {busy ? <Spinner /> : <Clapperboard className="h-4 w-4" aria-hidden="true" />} Animate {ordered.length} clip{ordered.length === 1 ? "" : "s"} · {cost} credits
          </Button>
          {short ? (
            <p className="w-full text-xs text-danger">
              Not enough credits for {ordered.length} clips. Pick fewer or <Link href="/billing" className="underline">top up</Link>.
            </p>
          ) : !valid ? (
            <p className="w-full text-xs text-ink-2">Pick at least {min}.</p>
          ) : null}
        </Card>
      </div>
    </section>
  );
}

/* ----------------------------- step 4 ----------------------------- */

function AnimatingStep({ reel }: { reel: ReelEvent }) {
  const chosen = orderForArc(reel.stills.filter((s) => reel.selectedStillIds.includes(s.id)));
  const doneIds = new Set(reel.clips.map((c) => c.sceneLabel));
  return (
    <section className="space-y-5 fade-up">
      <Card className="p-4 sm:p-5">
        <h2 className="text-lg font-medium text-ink">{reel.status === "assembling" ? "Stitching your reel" : "Bringing the scenes to life"}</h2>
        <div className="mt-2">
          <Progress value={reel.progress} label="Progress" />
          <p className="mt-1.5 text-xs text-ink-2" aria-live="polite">
            {reel.statusMessage ?? "Working"} · a few minutes
          </p>
        </div>
      </Card>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3" aria-label="Clips">
        {chosen.map((s, i) => {
          const made = doneIds.has(s.sceneLabel);
          return (
            <li key={s.id} className="image-frame relative aspect-[9/16]">
              <Image src={s.thumbUrl} alt={s.sceneLabel} width={360} height={640} unoptimized className={cn("h-full w-full object-cover transition-opacity duration-500", !made && "opacity-50")} />
              <span className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-surface/90 font-display text-sm font-bold text-ink">{i + 1}</span>
              <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-ink/70 to-transparent px-2 pb-2 pt-6 text-[11px] font-medium text-white">
                {made ? <Check className="h-3 w-3" aria-hidden="true" /> : <Spinner className="h-3 w-3" />} {made ? "Done" : "Animating"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-center text-sm text-ink-2">You can leave this page. The finished reel appears in your gallery.</p>
    </section>
  );
}

/* ----------------------------- step 5 ----------------------------- */

function DoneStep({ reel, garmentTitle, boutiqueName, onAnother }: { reel: ReelEvent; garmentTitle: string; boutiqueName: string; onAnother: () => void }) {
  const toast = useToast();
  const [sharing, setSharing] = React.useState(false);
  const output = reel.output!;

  async function share() {
    setSharing(true);
    try {
      const res = await fetch(`/api/reels/${reel.id}/download`);
      const blob = await res.blob();
      const file = new File([blob], `${garmentTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "vastra"}-reel.mp4`, { type: "video/mp4" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${garmentTitle} · ${boutiqueName}` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        toast.push({ title: "Saved to your downloads", body: "Post it from Instagram or send it on WhatsApp.", tone: "success" });
      }
    } catch {
      /* user cancelled the share sheet */
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="space-y-5 fade-up">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-2xl">Your reel is ready</h2>
        {reel.status === "partially_completed" ? <Badge tone="warning">Some clips refunded</Badge> : <Badge tone="success">Complete</Badge>}
        <span className="ml-auto text-xs text-ink-3">
          {output.durationSec ? `${output.durationSec} s · ` : ""}
          {reel.creditsCharged - reel.creditsRefunded} credits
        </span>
      </div>
      {reel.status === "partially_completed" && reel.statusMessage ? <Alert tone="warning">{reel.statusMessage}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
        <div className="image-frame mx-auto aspect-[9/16] w-full max-w-[360px] bg-night shadow-[var(--shadow-lg)]">
          <video src={output.url} poster={output.coverUrl ?? undefined} controls playsInline autoPlay muted loop className="h-full w-full object-cover" aria-label={`${garmentTitle} reel`} data-testid="reel-player" />
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" onClick={share} disabled={sharing} className="col-span-2">
              {sharing ? <Spinner /> : <Share2 className="h-4 w-4" aria-hidden="true" />} Share
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a href={`/api/reels/${reel.id}/download`}>
                <Download className="h-4 w-4" aria-hidden="true" /> Save
              </a>
            </Button>
            <ShareLinkButton targetType="reel" targetId={reel.id} title={`${garmentTitle} · ${boutiqueName}`} size="lg" variant="secondary" />
          </div>
          <p className="text-xs leading-5 text-ink-2">1080×1920, silent. Add music in Instagram or WhatsApp when you post it.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="md" variant="secondary" onClick={onAnother}>
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Another vibe
            </Button>
            <Button asChild size="md" variant="ghost">
              <Link href={`/gallery/${reel.garment.id}`}>Back to the garment</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
