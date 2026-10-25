"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { deleteCreditPackAction, saveCreditPack } from "@/app/actions/content";
import { AddToggle, CheckField, DangerButton, EditPanel, Field, FORM_GRID, FormFooter, formValues, LiveCount, Meta, Row, RowList, Section, StatusBadge, SubmitButton, useAction } from "../_shared";

type PackRow = { id: string; label: string; blurb: string; credits: number; amountMinor: number; currency: string; active: boolean; sort: number };

function PackForm({ row, onDone }: { row?: PackRow; onDone?: () => void }) {
  const { busy, run } = useAction();
  return (
    <form
      className={FORM_GRID}
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
      <Field label="Blurb" name="blurb" defaultValue={row?.blurb} className="sm:col-span-2 lg:col-span-3" placeholder="About 10 runs" />
      <Field label="Sort" name="sort" type="number" defaultValue={row?.sort ?? 0} />
      <input type="hidden" name="currency" value="INR" />
      <FormFooter submit={<SubmitButton busy={busy !== null}>{row ? "Save pack" : "Add pack"}</SubmitButton>}>
        <CheckField label="Live" name="active" defaultChecked={row?.active ?? true} />
      </FormFooter>
    </form>
  );
}

export function CreditPackEditor({ rows }: { rows: PackRow[] }) {
  const { busy, run } = useAction();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  return (
    <Section
      title="Credit packs"
      description="Prices are in whole rupees here and stored in paise; Razorpay orders use the stored amount at the moment of purchase, so editing a pack never changes a payment already made. The second pack is highlighted on the billing page."
      aside={
        <>
          <LiveCount live={rows.filter((p) => p.active).length} total={rows.length} />
          <AddToggle open={adding} onToggle={() => setAdding((v) => !v)}>
            New pack
          </AddToggle>
        </>
      }
    >
      {adding ? (
        <EditPanel title="New pack" className="mt-5">
          <PackForm onDone={() => setAdding(false)} />
        </EditPanel>
      ) : null}
      <RowList>
        {rows.map((p) => (
          <Row
            key={p.id}
            leading={
              <span className="flex h-12 min-w-12 flex-col items-center justify-center rounded-2xl bg-gold-soft px-2 font-display text-sm font-extrabold tabular-nums leading-none text-ink" aria-hidden="true">
                {p.credits.toLocaleString("en-IN")}
              </span>
            }
            title={p.label}
            id={p.id}
            badges={<StatusBadge active={p.active} />}
            meta={
              <Meta
                items={[
                  <span key="price" className="font-semibold text-ink">
                    ₹{(p.amountMinor / 100).toLocaleString("en-IN")}
                  </span>,
                  `${p.credits.toLocaleString("en-IN")} credits`,
                  `sort ${p.sort}`,
                ]}
              />
            }
            actions={
              <>
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(editing === p.id ? null : p.id)} aria-expanded={editing === p.id}>
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
              </>
            }
            expanded={editing === p.id ? <PackForm row={p} onDone={() => setEditing(null)} /> : null}
          >
            <p className="mt-1.5 text-sm leading-6 text-ink-2">{p.blurb || <span className="text-ink-3">No blurb yet</span>}</p>
          </Row>
        ))}
      </RowList>
    </Section>
  );
}
