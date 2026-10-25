"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { deleteBackdropAction, saveBackdrop } from "@/app/actions/content";
import { AddToggle, BACKDROP_KIND_OPTIONS, CheckField, DangerButton, EditPanel, Field, FORM_GRID, FormFooter, formValues, LiveCount, Meta, Row, RowList, Section, SelectField, StatusBadge, SubmitButton, useAction } from "../_shared";

type BackdropRow = { id: string; label: string; description: string; hex: string; kind: string; active: boolean; sort: number };

function BackdropForm({ row, onDone }: { row?: BackdropRow; onDone?: () => void }) {
  const { busy, run } = useAction();
  return (
    <form
      className={FORM_GRID}
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
      <Field label="Description" name="description" defaultValue={row?.description} className="sm:col-span-2 lg:col-span-3" hint="One line; used in the render prompt" />
      <Field label="Sort" name="sort" type="number" defaultValue={row?.sort ?? 0} />
      <FormFooter submit={<SubmitButton busy={busy !== null}>{row ? "Save backdrop" : "Add backdrop"}</SubmitButton>}>
        <CheckField label="Live" name="active" defaultChecked={row?.active ?? true} />
      </FormFooter>
    </form>
  );
}

export function BackdropEditor({ rows }: { rows: BackdropRow[] }) {
  const { busy, run } = useAction();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  return (
    <Section
      title="Backdrops"
      description="The hex colour fills the development placeholder and is the prompt hint for the real renders; the description is read by the person generator. Deleting a backdrop that past jobs used only affects their labels."
      aside={
        <>
          <LiveCount live={rows.filter((b) => b.active).length} total={rows.length} />
          <AddToggle open={adding} onToggle={() => setAdding((v) => !v)}>
            New backdrop
          </AddToggle>
        </>
      }
    >
      {adding ? (
        <EditPanel title="New backdrop" className="mt-5">
          <BackdropForm onDone={() => setAdding(false)} />
        </EditPanel>
      ) : null}
      <RowList>
        {rows.map((b) => (
          <Row
            key={b.id}
            leading={<span className="block h-12 w-12 rounded-2xl ring-1 ring-inset ring-black/10" style={{ backgroundColor: b.hex }} aria-hidden="true" />}
            title={b.label}
            id={b.id}
            badges={
              <>
                <Badge tone="neutral" className="capitalize">
                  {b.kind}
                </Badge>
                <StatusBadge active={b.active} />
              </>
            }
            meta={<Meta items={[<span key="hex" className="font-mono uppercase">{b.hex}</span>, `sort ${b.sort}`]} />}
            actions={
              <>
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(editing === b.id ? null : b.id)} aria-expanded={editing === b.id}>
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
              </>
            }
            expanded={editing === b.id ? <BackdropForm row={b} onDone={() => setEditing(null)} /> : null}
          >
            {b.description ? <p className="mt-1.5 text-sm leading-6 text-ink-2">{b.description}</p> : null}
          </Row>
        ))}
      </RowList>
    </Section>
  );
}
