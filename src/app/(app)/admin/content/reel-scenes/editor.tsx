"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { deleteReelSceneAction, saveReelScene } from "@/app/actions/content";
import { CheckField, DangerButton, Field, formValues, SelectField, SHOT_TYPE_OPTIONS, SubmitButton, TextAreaField, useAction, VIBE_OPTIONS } from "../_shared";

type Row = { id: string; vibe: string; label: string; shotType: string; prompt: string; active: boolean; sort: number };

function SceneForm({ row, vibe, onDone }: { row?: Row; vibe?: string; onDone?: () => void }) {
  const { busy, run } = useAction();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run("save", () => saveReelScene(formValues(e.currentTarget) as Parameters<typeof saveReelScene>[0]));
        if (ok) onDone?.();
      }}
    >
      <Field label="Id" name="id" defaultValue={row?.id} required placeholder="festive-10" hint={row ? "Ids cannot change" : undefined} />
      <SelectField label="Vibe" name="vibe" defaultValue={row?.vibe ?? vibe ?? "everyday"} options={VIBE_OPTIONS} />
      <Field label="Label" name="label" defaultValue={row?.label} required placeholder="Rooftop golden hour" />
      <SelectField label="Shot type" name="shotType" defaultValue={row?.shotType ?? "full-body"} options={SHOT_TYPE_OPTIONS} />
      <div className="sm:col-span-2 lg:col-span-3">
        <TextAreaField label="Scene prompt" name="prompt" defaultValue={row?.prompt} rows={2} hint="Continues the sentence 'Scene: she is …'" />
      </div>
      <Field label="Sort" name="sort" type="number" defaultValue={row?.sort ?? 0} />
      <div className="flex items-end gap-4 sm:col-span-2">
        <CheckField label="Active" name="active" defaultChecked={row?.active ?? true} />
        <SubmitButton busy={busy !== null}>{row ? "Save" : "Add"}</SubmitButton>
      </div>
    </form>
  );
}

export function ReelSceneEditor({ rows }: { rows: Row[] }) {
  const { busy, run } = useAction();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState<string | null>(null);
  const vibes = VIBE_OPTIONS.map((v) => v.value);
  return (
    <div className="space-y-8">
      {vibes.map((vibe) => (
        <section key={vibe}>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-xl capitalize">{vibe}</h2>
            <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(adding === vibe ? null : vibe)}>
              {adding === vibe ? "Close" : "New scene"}
            </Button>
          </div>
          {adding === vibe ? (
            <Card className="mb-3 p-4">
              <SceneForm vibe={vibe} onDone={() => setAdding(null)} />
            </Card>
          ) : null}
          <ul className="space-y-2">
            {rows
              .filter((s) => s.vibe === vibe)
              .map((s) => (
                <li key={s.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-ink">{s.label}</p>
                          <code className="text-xs text-ink-3">{s.id}</code>
                          <Badge tone="neutral">{s.shotType}</Badge>
                          <Badge tone={s.active ? "success" : "neutral"}>{s.active ? "active" : "hidden"}</Badge>
                          <span className="text-xs text-ink-3">sort {s.sort}</span>
                        </div>
                        <p className="mt-1 text-xs text-ink-2">{s.prompt}</p>
                      </div>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(editing === s.id ? null : s.id)}>
                        {editing === s.id ? "Close" : "Edit"}
                      </Button>
                      <DangerButton
                        busy={busy !== null}
                        onClick={() => {
                          if (window.confirm(`Delete the scene "${s.label}"?`)) void run(`del-${s.id}`, () => deleteReelSceneAction(s.id), "Deleted");
                        }}
                      >
                        Delete
                      </DangerButton>
                    </div>
                    {editing === s.id ? (
                      <div className="mt-4 border-t border-line pt-4">
                        <SceneForm row={s} onDone={() => setEditing(null)} />
                      </div>
                    ) : null}
                  </Card>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
