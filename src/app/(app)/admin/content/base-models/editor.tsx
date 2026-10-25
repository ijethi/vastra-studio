"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge, Card, Label } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { clearBaseModelImage, saveBaseModel, setBaseModelActiveAction } from "@/app/actions/content";
import { AGE_OPTIONS, BODY_TYPE_OPTIONS, CheckField, DangerButton, Field, formValues, POSE_OPTIONS, SelectField, SKIN_TONE_OPTIONS, SubmitButton, useAction } from "../_shared";

export type AdminBaseModel = {
  id: string;
  label: string;
  bodyType: string;
  skinTone: string;
  ageRange: string;
  pose: string;
  imageUrl: string | null;
  imageKey: string | null;
  previewUrl: string | null;
  width: number;
  height: number;
  licenceNote: string;
  active: boolean;
  sort: number;
  renders: string[];
};

type Backdrop = { id: string; label: string };

function BaseModelForm({ model, onDone }: { model?: AdminBaseModel; onDone?: () => void }) {
  const { busy, run } = useAction();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        const ok = await run("save", () => saveBaseModel(v as Parameters<typeof saveBaseModel>[0]));
        if (ok) onDone?.();
      }}
    >
      <Field label="Id" name="id" defaultValue={model?.id} required placeholder="bm-curvy-dusky-30s" hint={model ? "Ids cannot change" : "Lowercase, digits and dashes"} />
      <Field label="Label" name="label" defaultValue={model?.label} required placeholder="Curvy · Dusky · 30s" />
      <SelectField label="Body type" name="bodyType" defaultValue={model?.bodyType ?? "regular"} options={BODY_TYPE_OPTIONS} />
      <SelectField label="Skin tone" name="skinTone" defaultValue={model?.skinTone ?? "wheatish"} options={SKIN_TONE_OPTIONS} />
      <SelectField label="Age range" name="ageRange" defaultValue={model?.ageRange ?? "20s"} options={AGE_OPTIONS} />
      <SelectField label="Pose" name="pose" defaultValue={model?.pose ?? "front"} options={POSE_OPTIONS} />
      <Field label="Sort" name="sort" type="number" defaultValue={model?.sort ?? 0} />
      <Field label="Preview URL (optional)" name="imageUrl" defaultValue={model?.imageUrl ?? ""} placeholder="https://cdn.example.com/models/x.jpg" hint="Leave empty to use the uploaded preview" />
      <Field label="Licence note" name="licenceNote" defaultValue={model?.licenceNote ?? "AI-generated, rights-clear, human reviewed"} className="sm:col-span-2" />
      <div className="flex items-end gap-4 sm:col-span-2">
        <CheckField label="Active (shown in the studio)" name="active" defaultChecked={model?.active ?? true} />
        <SubmitButton busy={busy !== null}>{model ? "Save" : "Add model"}</SubmitButton>
      </div>
    </form>
  );
}

export function NewBaseModel() {
  const [open, setOpen] = React.useState(false);
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-ink">Add a base model</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "New model"}
        </Button>
      </div>
      {open ? (
        <div className="mt-4">
          <BaseModelForm onDone={() => setOpen(false)} />
        </div>
      ) : null}
    </Card>
  );
}

function UploadRender({ model, backdrops }: { model: AdminBaseModel; backdrops: Backdrop[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [backdrop, setBackdrop] = React.useState("");
  const id = React.useId();

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.push({ title: "Choose an image first", tone: "danger" });
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      if (backdrop) body.set("backdrop", backdrop);
      const res = await fetch(`/api/admin/content/base-models/${encodeURIComponent(model.id)}/upload`, { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { error?: string; key?: string };
      if (!res.ok) return toast.push({ title: json.error ?? "Upload failed", tone: "danger" });
      toast.push({ title: backdrop ? `Render stored for ${backdrop}` : "Preview updated", tone: "success" });
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <Label htmlFor={`${id}-file`}>Upload render</Label>
        <input id={`${id}-file`} ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block text-xs text-ink-2" />
      </div>
      <div>
        <Label htmlFor={`${id}-bd`}>For</Label>
        <select id={`${id}-bd`} value={backdrop} onChange={(e) => setBackdrop(e.target.value)} className="mt-1 block rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink">
          <option value="">Preview card (studio)</option>
          {backdrops.map((b) => (
            <option key={b.id} value={b.id}>
              Pipeline render · {b.label}
            </option>
          ))}
        </select>
      </div>
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={upload}>
        {busy ? "Uploading…" : "Upload"}
      </Button>
    </div>
  );
}

export function BaseModelEditor({ models, backdrops }: { models: AdminBaseModel[]; backdrops: Backdrop[] }) {
  const { busy, run } = useAction();
  const [editing, setEditing] = React.useState<string | null>(null);
  return (
    <ul className="space-y-3">
      {models.map((m) => (
        <li key={m.id}>
          <Card className="p-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {m.previewUrl ? <Image src={m.previewUrl} alt="" width={64} height={96} unoptimized className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink">{m.label}</p>
                  <code className="text-xs text-ink-3">{m.id}</code>
                  <Badge tone={m.active ? "success" : "neutral"}>{m.active ? "active" : "hidden"}</Badge>
                  {m.imageKey ? <Badge tone="accent">uploaded preview</Badge> : m.imageUrl ? <Badge tone="accent">external preview</Badge> : <Badge tone="warning">placeholder preview</Badge>}
                </div>
                <p className="mt-1 text-xs text-ink-2">
                  {m.bodyType} · {m.skinTone} · {m.ageRange} · {m.pose} · sort {m.sort} · {m.width}×{m.height}
                </p>
                <p className="mt-1 text-xs text-ink-3">
                  Pipeline renders: {m.renders.length ? m.renders.join(", ") : "none (placeholder silhouette is used)"}
                </p>
                <div className="mt-3">
                  <UploadRender model={m} backdrops={backdrops} />
                </div>
                {editing === m.id ? (
                  <div className="mt-4 border-t border-line pt-4">
                    <BaseModelForm model={m} onDone={() => setEditing(null)} />
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(editing === m.id ? null : m.id)}>
                  {editing === m.id ? "Close" : "Edit"}
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => run(`toggle-${m.id}`, () => setBaseModelActiveAction(m.id, !m.active), m.active ? "Hidden from the studio" : "Shown in the studio")}>
                  {m.active ? "Hide" : "Show"}
                </Button>
                {m.imageKey ? (
                  <DangerButton busy={busy !== null} onClick={() => run(`clear-${m.id}`, () => clearBaseModelImage(m.id), "Preview removed")}>
                    Remove preview
                  </DangerButton>
                ) : null}
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
