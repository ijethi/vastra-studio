"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { deleteCreditPackAction, saveCreditPack } from "@/app/actions/content";
import { CheckField, DangerButton, Field, formValues, SubmitButton, useAction } from "../_shared";

type Row = { id: string; label: string; blurb: string; credits: number; amountMinor: number; currency: string; active: boolean; sort: number };

function PackForm({ row, onDone }: { row?: Row; onDone?: () => void }) {
  const { busy, run } = useAction();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run("save", () => saveCreditPack(formValues(e.currentTarget) as Parameters<typeof saveCreditPack>[0]));
        if (ok) onDone?.();
      }}
    >
      <Field label="Id" name="id" defaultValue={row?.id} required placeholder="starter" hint={row ? "Ids cannot change" : undefined} />
      <Field label="Label" name="label" defaultValue={row?.label} required />
      <Field label="Credits" name="credits" type="number" defaultValue={row?.credits ?? 250} required />
      <Field label="Price (₹)" name="amountRupees" type="number" defaultValue={row ? row.amountMinor / 100 : 375} required hint="Including GST" />
      <Field label="Blurb" name="blurb" defaultValue={row?.blurb} className="sm:col-span-2" placeholder="About 10 runs" />
      <Field label="Sort" name="sort" type="number" defaultValue={row?.sort ?? 0} />
      <input type="hidden" name="currency" value="INR" />
      <div className="flex items-end gap-4">
        <CheckField label="Active" name="active" defaultChecked={row?.active ?? true} />
        <SubmitButton busy={busy !== null}>{row ? "Save" : "Add"}</SubmitButton>
      </div>
    </form>
  );
}

export function CreditPackEditor({ rows }: { rows: Row[] }) {
  const { busy, run } = useAction();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  return (
    <div className="space-y-3">
      <Card className="p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-ink">Add a credit pack</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : "New pack"}
          </Button>
        </div>
        {adding ? (
          <div className="mt-4">
            <PackForm onDone={() => setAdding(false)} />
          </div>
        ) : null}
      </Card>
      <ul className="space-y-3">
        {rows.map((p) => (
          <li key={p.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{p.label}</p>
                    <code className="text-xs text-ink-3">{p.id}</code>
                    <Badge tone={p.active ? "success" : "neutral"}>{p.active ? "active" : "hidden"}</Badge>
                  </div>
                  <p className="text-xs text-ink-2">
                    {p.credits.toLocaleString("en-IN")} credits · ₹{(p.amountMinor / 100).toLocaleString("en-IN")} · {p.blurb || "no blurb"} · sort {p.sort}
                  </p>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                  {editing === p.id ? "Close" : "Edit"}
                </Button>
                <DangerButton
                  busy={busy !== null}
                  onClick={() => {
                    if (window.confirm(`Delete the pack "${p.label}"? Past payments keep their own amounts.`)) void run(`del-${p.id}`, () => deleteCreditPackAction(p.id), "Deleted");
                  }}
                >
                  Delete
                </DangerButton>
              </div>
              {editing === p.id ? (
                <div className="mt-4 border-t border-line pt-4">
                  <PackForm row={p} onDone={() => setEditing(null)} />
                </div>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
