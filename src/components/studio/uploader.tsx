"use client";

import * as React from "react";
import { Camera, ImagePlus, Upload } from "lucide-react";
import { requestUploadUrl, registerGarment } from "@/app/actions/garments";
import { getGarmentSummary, type GarmentSummary } from "@/app/actions/studio";
import { Alert, Progress } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";
const MAX = 15 * 1024 * 1024;

type Phase = "idle" | "uploading" | "processing";

export function Uploader({ onReady }: { onReady: (g: GarmentSummary) => void }) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [progress, setProgress] = React.useState(0);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPT.split(",").includes(file.type) && !/\.(heic|heif)$/i.test(file.name)) {
      return setError("Please choose a JPEG, PNG, WebP or HEIC photo.");
    }
    if (file.size > MAX) return setError("That photo is over 15 MB. Most phones can export a smaller copy.");

    const url = URL.createObjectURL(file);
    setPreview(url);
    setPhase("uploading");
    setProgress(0);

    const contentType = file.type || "image/heic";
    const signed = await requestUploadUrl({ contentType, size: file.size });
    if (!signed.ok) {
      setPhase("idle");
      return setError(signed.error);
    }

    try {
      await putWithProgress(signed.data.url, file, signed.data.headers, setProgress);
    } catch {
      setPhase("idle");
      return setError("The upload was interrupted. Please check your connection and try again.");
    }

    setPhase("processing");
    const reg = await registerGarment(signed.data.uploadId);
    if (!reg.ok) {
      setPhase("idle");
      return setError(reg.error);
    }
    const summary = await getGarmentSummary(reg.data.garmentId);
    if (summary) onReady(summary);
    setPhase("idle");
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  const busy = phase !== "idle";

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a garment photo"
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={cn(
          "card relative flex min-h-[380px] cursor-pointer flex-col items-center justify-center overflow-hidden p-8 text-center transition-colors",
          drag && "border-accent bg-accent-soft/40",
          busy && "cursor-default",
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className={cn("absolute inset-0 h-full w-full object-cover transition-opacity", busy ? "opacity-30" : "opacity-20")} />
        ) : null}
        <div className="relative z-10 max-w-sm">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            {busy ? <Upload className="h-6 w-6 animate-pulse" aria-hidden="true" /> : <ImagePlus className="h-6 w-6" aria-hidden="true" />}
          </div>
          {busy ? (
            <>
              <h2 className="text-xl">{phase === "uploading" ? "Uploading your photo" : "Checking the photo"}</h2>
              <div className="mt-4">
                <Progress value={phase === "uploading" ? progress : 100} label="Upload progress" />
              </div>
              <p className="mt-2 text-sm text-ink-2">{phase === "uploading" ? `${progress}%` : "Removing metadata and preparing a preview"}</p>
            </>
          ) : (
            <>
              <h2 className="text-xl">Drop a garment photo here</h2>
              <p className="mt-2 text-sm leading-6 text-ink-2">Flat-lay, hanger or mannequin. Even light, the whole garment in frame. JPEG, PNG, WebP or HEIC up to 15 MB.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
                <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 py-2 text-ink">
                  <Upload className="h-4 w-4" aria-hidden="true" /> Choose a photo
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 py-2 text-ink sm:hidden">
                  <Camera className="h-4 w-4" aria-hidden="true" /> Take a photo
                </span>
              </div>
            </>
          )}
        </div>
        <input ref={inputRef} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} disabled={busy} />
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}

function putWithProgress(url: string, file: File, headers: Record<string, string>, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(file);
  });
}
