"use client";

import * as React from "react";
import { Camera, Images } from "lucide-react";
import { Alert } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * The first screen. Two big buttons, no settings. Phone users get the camera
 * directly; everyone can drop or pick several photos at once.
 */
export function Uploader({ onFiles, busy, hint }: { onFiles: (files: File[]) => void; busy?: boolean; hint?: string }) {
  const [drag, setDrag] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const galleryRef = React.useRef<HTMLInputElement>(null);

  function accept(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const bad = files.find((f) => !ACCEPT.split(",").includes(f.type) && !/\.(heic|heif)$/i.test(f.name));
    if (bad) return setError("Please choose photos only: JPEG, PNG, WebP or HEIC.");
    const big = files.find((f) => f.size > MAX_UPLOAD_BYTES);
    if (big) return setError(`"${big.name}" is over 15 MB. Most phones can export a smaller copy.`);
    setError(null);
    onFiles(files.slice(0, 30));
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!busy) accept(e.dataTransfer.files);
        }}
        className={cn("card wash relative flex min-h-[420px] flex-col items-center justify-center p-8 text-center transition-colors", drag && "border-accent bg-accent-soft/40")}
      >
        <p className="eyebrow mb-3">Step 1 of 2</p>
        <h2 className="display-lg">Add a photo of the garment</h2>
        <p className="mt-3 max-w-md text-[0.95rem] leading-7 text-ink-2">
          On a hanger, flat on a table or on a mannequin. Good light, whole garment in the frame. We do the rest.
        </p>
        <div className="mt-8 grid w-full max-w-md gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-accent text-on-accent shadow-[var(--shadow)] transition-transform hover:bg-accent-hover active:scale-[0.99] disabled:opacity-60"
          >
            <Camera className="h-7 w-7" aria-hidden="true" />
            <span className="text-base font-semibold">Take a photo</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => galleryRef.current?.click()}
            className="flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-line-strong bg-surface text-ink shadow-[var(--shadow)] transition-transform hover:bg-surface-2 active:scale-[0.99] disabled:opacity-60"
          >
            <Images className="h-7 w-7 text-teal" aria-hidden="true" />
            <span className="text-base font-semibold">Choose photos</span>
            <span className="text-xs text-ink-2">one or many</span>
          </button>
        </div>
        <p className="mt-5 text-xs text-ink-3">{hint ?? "Each photo makes 2 versions for 25 credits. Nothing is charged for photos we cannot use."}</p>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a photo" onChange={(e) => accept(e.target.files)} disabled={busy} />
        <input ref={galleryRef} type="file" accept={ACCEPT} multiple className="sr-only" aria-label="Choose photos" onChange={(e) => accept(e.target.files)} disabled={busy} />
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}

export function putWithProgress(url: string, file: File, headers: Record<string, string>, onProgress: (pct: number) => void) {
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
