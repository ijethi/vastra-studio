"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, Download, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { deleteGarmentAction, renameGarmentAction } from "@/app/actions/garments";
import { acceptImageAction } from "@/app/actions/jobs";

export function GarmentActions({ garmentId, title, canDelete }: { garmentId: string; title: string; canDelete: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [name, setName] = React.useState(title);
  const [busy, setBusy] = React.useState(false);

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="secondary" size="icon" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-48 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lg)] fade-up">
            <DropdownMenu.Item onSelect={() => setRenameOpen(true)} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink outline-none hover:bg-surface-2 focus:bg-surface-2">
              <Pencil className="h-4 w-4" aria-hidden="true" /> Rename
            </DropdownMenu.Item>
            {canDelete ? (
              <DropdownMenu.Item onSelect={() => setDeleteOpen(true)} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger outline-none hover:bg-danger-soft focus:bg-danger-soft">
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete garment
              </DropdownMenu.Item>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent title="Rename this piece">
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const res = await renameGarmentAction(garmentId, name);
              setBusy(false);
              if (!res.ok) return toast.push({ title: res.error, tone: "danger" });
              setRenameOpen(false);
              router.refresh();
            }}
          >
            <div>
              <Label htmlFor="garment-title">Title</Label>
              <Input id="garment-title" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={busy}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent title="Delete this garment?" description="The photo and every generated image will be removed. This cannot be undone.">
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Keep it</Button>
            </DialogClose>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await deleteGarmentAction(garmentId);
                setBusy(false);
                if (!res.ok) return toast.push({ title: res.error, tone: "danger" });
                toast.push({ title: "Garment deleted", tone: "neutral" });
                router.push("/gallery");
                router.refresh();
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ImageCard({
  image,
  alt,
}: {
  image: { id: string; url: string; width: number; height: number; qualityScore: number | null; accepted: boolean; provider: string };
  alt: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [accepted, setAccepted] = React.useState(image.accepted);

  return (
    <figure className="group">
      <div className="image-frame aspect-[2/3]">
        <Image src={image.url} alt={alt} width={image.width} height={image.height} unoptimized className="h-full w-full object-cover" />
        {accepted ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-on-accent">
            <Check className="h-3 w-3" aria-hidden="true" /> Kept
          </span>
        ) : null}
      </div>
      <figcaption className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-ink-2">Quality {Math.round((image.qualityScore ?? 0) * 100)}%</span>
        <span className="flex items-center gap-1">
          <Button
            variant={accepted ? "primary" : "secondary"}
            size="sm"
            aria-pressed={accepted}
            onClick={async () => {
              const next = !accepted;
              setAccepted(next);
              const res = await acceptImageAction(image.id, next);
              if (!res.ok) {
                setAccepted(!next);
                toast.push({ title: res.error, tone: "danger" });
              }
              router.refresh();
            }}
          >
            <Check className="h-4 w-4" aria-hidden="true" /> {accepted ? "Kept" : "Keep"}
          </Button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon" aria-label="Download options">
                <Download className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-52 rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-lg)] fade-up">
                {[
                  { size: "ig-portrait", label: "Instagram post · 1080×1350" },
                  { size: "story", label: "Story · 1080×1920" },
                  { size: "print", label: "Print · 2× upscale" },
                  { size: "original", label: "Original" },
                ].map((o) => (
                  <DropdownMenu.Item key={o.size} asChild>
                    <a href={`/api/images/${image.id}/download?size=${o.size}`} className="block cursor-pointer rounded-lg px-3 py-2 text-sm text-ink outline-none hover:bg-surface-2 focus:bg-surface-2">
                      {o.label}
                    </a>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </span>
      </figcaption>
    </figure>
  );
}
