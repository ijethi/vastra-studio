"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { deleteBackdropAction, saveBackdrop } from "@/app/actions/content";
import { BACKDROP_KIND_OPTIONS, CheckField, DangerButton, Field, formValues, SelectField, SubmitButton, useAction } from "../_shared";

type Row = { id: string; label: string; description: string; hex: string; kind: string; active: boolean; sort: number };

function BackdropForm({ row, onDone }: { row?: Row; onDone?: () => void }) {
  const { busy, run } = useAction();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run("save", () => saveBackdrop(formValues(e.currentTarget) as Parameters<typeof saveBackdrop>[0]));
        if (ok) onDone?.();
      }}
    >
      <Field label="Id" name="id" defaultValue={row?.id} required placeholder="studio-ivory" hint={row ? "Ids cannot change" : undefined} />
      <Field label="Label" name="label" defaultValue={row?.label} required />
      <Field label="Hex colour" name="hex" defaultValue={row?.hex ?? "#F4EFE6"} required placeholder="#F4EFE6" />
      <SelectField label="Kind" name="kind" defaultValue={row?.kind ?? "studio"} options={BACKDROP_KIND_OPTIONS} />
      <Field label="Description" name="description" defaultValue={row?.description} className="sm:col-span-2" hint="One line; used in the render prompt" />
      <Field label="Sort" name="sort" type="number" defaultValue={row?.sort ?? 0} />
      <div className="flex items-end gap-4">
        <CheckField label="Active" name="active" defaultChecked={row?.active ?? true} />
        <SubmitButton busy={busy !== null}>{row ? "Save" : "Add"}</SubmitButton>
      </div>
    </form>
  );
}

export function BackdropEditor({ rows }: { rows: Row[] }) {
  const { busy, run } = useAction();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  return (
    <div className="space-y-3">
      <Card className="p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-ink">Add a backdrop</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : "New backdrop"}
          </Button>
        </div>
        {adding ? (
          <div className="mt-4">
            <BackdropForm onDone={() => setAdding(false)} />
          </div>
        ) : null}
      </Card>
      <ul className="space-y-3">
        {rows.map((b) => (
          <li key={b.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="h-8 w-8 shrink-0 rounded-full border border-line" style={{ backgroundColor: b.hex }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{b.label}</p>
                    <code className="text-xs text-ink-3">{b.id}</code>
                    <Badge tone={b.active ? "success" : "neutral"}>{b.active ? "active" : "hidden"}</Badge>
                  </div>
                  <p className="text-xs text-ink-2">
                    {b.kind} · {b.hex} · sort {b.sort} · {b.description}
                  </p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(editing === b.id ? null : b.id)}>
                  {editing === b.id ? "Close" : "Edit"}
                </Button>
                <DangerButton
                  busy={busy !== null}
                  onClick={() => {
                    if (window.confirm(`Delete the backdrop "${b.label}"? Boutiques that chose it as their default fall back to the house default.`)) void run(`del-${b.id}`, () => deleteBackdropAction(b.id), "Deleted");
                  }}
                >
                  Delete
                </DangerButton>
              </div>
              {editing === b.id ? (
                <div className="mt-4 border-t border-line pt-4">
                  <BackdropForm row={b} onDone={() => setEditing(null)} />
                </div>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
