"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { requestUploadUrl, addGarmentPhotoAction, deleteGarmentPhotoAction } from "@/app/actions/garments";
import { putWithProgress } from "@/components/studio/uploader";
import type { GarmentPhotoKind } from "@/lib/db/schema";

export type ExtraPhoto = { id: string; kind: GarmentPhotoKind; thumbUrl: string };

const KINDS: Array<{ kind: GarmentPhotoKind; label: string; help: string }> = [
  { kind: "back", label: "Back", help: "The back of the garment, same light as the front." },
  { kind: "detail", label: "Detail", help: "Close-up of embroidery, print or fabric." },
];

/**
 * Optional extra angles. Reels use the back photo for turn-away scenes and
 * the detail photo for the fabric close-up, so the video shows the real work.
 */
export function ExtraPhotos({ garmentId, photos, canEdit, max }: { garmentId: string; photos: ExtraPhoto[]; canEdit: boolean; max: number }) {
  const router = useRouter();
  const toast = useToast();
  const [busyKind, setBusyKind] = React.useState<GarmentPhotoKind | null>(null);
  const inputs = React.useRef<Record<string, HTMLInputElement | null>>({});

  async function upload(kind: GarmentPhotoKind, file: File) {
    setBusyKind(kind);
    try {
      const signed = await requestUploadUrl({ contentType: file.type || "image/heic", size: file.size });
      if (!signed.ok) throw new Error(signed.error);
      await putWithProgress(signed.data.url, file, signed.data.headers, () => {});
      const res = await addGarmentPhotoAction(garmentId, signed.data.uploadId, kind);
      if (!res.ok) throw new Error(res.error);
      toast.push({ title: `${kind === "back" ? "Back" : "Detail"} photo added`, tone: "success" });
      router.refresh();
    } catch (err) {
      toast.push({ title: (err as Error).message || "Could not add the photo.", tone: "danger" });
    } finally {
      setBusyKind(null);
    }
  }

  return (
    <div className="mt-6">
      <p className="eyebrow mb-2">More angles</p>
      <p className="mb-3 text-xs leading-5 text-ink-2">Optional. A back and a detail photo make reels truer to the piece.</p>
      <ul className="grid grid-cols-3 gap-2">
        {photos.map((p) => (
          <li key={p.id} className="group relative">
            <div className="image-frame aspect-[3/4]">
              <Image src={p.thumbUrl} alt={`${p.kind} photo`} width={240} height={320} unoptimized className="h-full w-full object-cover" />
              <span className="absolute left-1.5 top-1.5 rounded-full bg-surface/90 px-2 py-0.5 text-[10px] font-semibold capitalize text-ink">{p.kind}</span>
            </div>
            {canEdit ? (
              <button
                type="button"
                aria-label={`Remove ${p.kind} photo`}
                onClick={async () => {
                  const res = await deleteGarmentPhotoAction(p.id);
                  if (!res.ok) return toast.push({ title: res.error, tone: "danger" });
                  router.refresh();
                }}
                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-surface/90 text-ink-2 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </li>
        ))}
        {canEdit && photos.length < max
          ? KINDS.filter((k) => !photos.some((p) => p.kind === k.kind)).map((k) => (
              <li key={k.kind}>
                <button
                  type="button"
                  disabled={busyKind !== null}
                  onClick={() => inputs.current[k.kind]?.click()}
                  className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed border-line-strong text-ink-2 transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
                  title={k.help}
                >
                  {busyKind === k.kind ? <Spinner /> : <Plus className="h-5 w-5" aria-hidden="true" />}
                  <span className="text-xs font-semibold">{k.label}</span>
                </button>
                <input
                  ref={(el) => {
                    inputs.current[k.kind] = el;
                  }}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label={`Add ${k.label.toLowerCase()} photo`}
                  onChange={(e) => e.target.files?.[0] && upload(k.kind, e.target.files[0])}
                />
              </li>
            ))
          : null}
      </ul>
      {canEdit && photos.length >= 2 ? (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => inputs.current.other?.click()} disabled={busyKind !== null || photos.length >= max}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Another angle
          <input
            ref={(el) => {
              inputs.current.other = el;
            }}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Add another angle"
            onChange={(e) => e.target.files?.[0] && upload("other", e.target.files[0])}
          />
        </Button>
      ) : null}
    </div>
  );
}
