"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Label, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { clearBaseModelImage, saveBaseModel, setBaseModelActiveAction } from "@/app/actions/content";
import { AddToggle, AGE_OPTIONS, BODY_TYPE_OPTIONS, CheckField, DangerButton, EditPanel, Field, FORM_GRID, FormFooter, formValues, LiveCount, Meta, POSE_OPTIONS, Row, RowList, Section, SelectField, SKIN_TONE_OPTIONS, StatusBadge, SubmitButton, useAction } from "../_shared";

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

const optionLabel = (options: Array<{ value: string; label: string }>, value: string) => options.find((o) => o.value === value)?.label ?? value;

function BaseModelForm({ model, onDone }: { model?: AdminBaseModel; onDone?: () => void }) {
  const { busy, run } = useAction();
  return (
    <form
      className={FORM_GRID}
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
      <Field label="Licence note" name="licenceNote" defaultValue={model?.licenceNote ?? "AI-generated, rights-clear, human reviewed"} className="sm:col-span-2 lg:col-span-4" />
      <FormFooter submit={<SubmitButton busy={busy !== null}>{model ? "Save model" : "Add model"}</SubmitButton>}>
        <CheckField label="Live (shown in the studio)" name="active" defaultChecked={model?.active ?? true} />
      </FormFooter>
    </form>
  );
}

function UploadRender({ model, backdrops }: { model: AdminBaseModel; backdrops: Backdrop[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
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
      setFileName(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
      <div className="min-w-0">
        <Label htmlFor={`${id}-file`}>Image</Label>
        <div className="flex h-11 items-center gap-3 rounded-[var(--radius-control)] border border-dashed border-line-strong bg-surface px-2 pl-2">
          <label htmlFor={`${id}-file`} className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-surface-2 px-3 text-xs font-semibold text-ink transition-colors hover:bg-surface-3">
            <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Choose
          </label>
          <input id={`${id}-file`} ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)} />
          <span className={cn("min-w-0 truncate text-xs", fileName ? "text-ink" : "text-ink-3")}>{fileName ?? "JPEG, PNG or WebP"}</span>
        </div>
      </div>
      <div>
        <Label htmlFor={`${id}-bd`}>Use as</Label>
        <select id={`${id}-bd`} value={backdrop} onChange={(e) => setBackdrop(e.target.value)} className="h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 text-sm text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15">
          <option value="">Preview card (studio)</option>
          {backdrops.map((b) => (
            <option key={b.id} value={b.id}>
              Pipeline render · {b.label}
            </option>
          ))}
        </select>
      </div>
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={upload} className="h-11 sm:col-span-2 lg:col-span-1">
        {busy ? <Spinner /> : null} {busy ? "Uploading…" : "Upload"}
      </Button>
    </div>
  );
}

export function BaseModelEditor({ models, backdrops }: { models: AdminBaseModel[]; backdrops: Backdrop[] }) {
  const { busy, run } = useAction();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  return (
    <Section
      title="Base models"
      description="A model needs a preview (shown in the studio) and, for photoreal output, one render per backdrop in storage; without a render the pipeline draws the development placeholder."
      aside={
        <>
          <LiveCount live={models.filter((m) => m.active).length} total={models.length} />
          <AddToggle open={adding} onToggle={() => setAdding((v) => !v)}>
            New model
          </AddToggle>
        </>
      }
    >
      {adding ? (
        <EditPanel title="New model" className="mt-5">
          <BaseModelForm onDone={() => setAdding(false)} />
        </EditPanel>
      ) : null}
      <RowList>
        {models.map((m) => (
          <Row
            key={m.id}
            leading={
              <div className="image-frame h-20 w-14">
                {m.previewUrl ? <Image src={m.previewUrl} alt="" width={56} height={80} unoptimized className="h-full w-full object-cover" /> : null}
              </div>
            }
            title={m.label}
            id={m.id}
            badges={
              <>
                <StatusBadge active={m.active} />
                {m.imageKey ? <Badge tone="accent">Uploaded preview</Badge> : m.imageUrl ? <Badge tone="accent">External preview</Badge> : <Badge tone="warning">Placeholder preview</Badge>}
              </>
            }
            meta={<Meta items={[optionLabel(BODY_TYPE_OPTIONS, m.bodyType), optionLabel(SKIN_TONE_OPTIONS, m.skinTone), m.ageRange, optionLabel(POSE_OPTIONS, m.pose), `${m.width}×${m.height}`, `sort ${m.sort}`]} />}
            actions={
              <>
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(editing === m.id ? null : m.id)} aria-expanded={editing === m.id}>
                  {editing === m.id ? "Close" : "Edit"}
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => run(`toggle-${m.id}`, () => setBaseModelActiveAction(m.id, !m.active), m.active ? "Hidden from the studio" : "Shown in the studio")}>
                  {m.active ? "Hide" : "Show"}
                </Button>
              </>
            }
            expanded={
              editing === m.id ? (
                <div className="space-y-6">
                  <div>
                    <p className="eyebrow mb-4">Details</p>
                    <BaseModelForm model={m} onDone={() => setEditing(null)} />
                  </div>
                  <div className="border-t border-line pt-5">
                    <p className="eyebrow mb-1">Images</p>
                    <p className="mb-4 text-xs leading-5 text-ink-3">The preview card is what boutiques pick in the studio. A pipeline render is the photoreal base the garment is composited on, one per backdrop.</p>
                    <UploadRender model={m} backdrops={backdrops} />
                    {m.imageKey ? (
                      <div className="mt-3">
                        <DangerButton busy={busy !== null} onClick={() => run(`clear-${m.id}`, () => clearBaseModelImage(m.id), "Preview removed")}>
                          Remove uploaded preview
                        </DangerButton>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null
            }
          >
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Renders</span>
              {backdrops.map((b) => {
                const have = m.renders.includes(b.id);
                return (
                  <span key={b.id} className={cn("inline-flex h-6 items-center rounded-full px-2 text-[11px] font-medium", have ? "bg-teal-soft text-teal" : "bg-surface-2 text-ink-3 line-through decoration-line-strong")} title={have ? `Render stored for ${b.label}` : `No render for ${b.label} yet`}>
                    {b.label}
                  </span>
                );
              })}
              {backdrops.length === 0 ? <span className="text-xs text-ink-3">No backdrops yet</span> : null}
            </div>
          </Row>
        ))}
      </RowList>
    </Section>
  );
}
