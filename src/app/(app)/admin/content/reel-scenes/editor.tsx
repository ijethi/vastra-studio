"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { deleteReelSceneAction, saveReelScene } from "@/app/actions/content";
import { AddToggle, CheckField, DangerButton, EditPanel, Field, FORM_GRID, FormFooter, formValues, LiveCount, Meta, Row, RowList, Section, SelectField, SHOT_TYPE_OPTIONS, StatusBadge, SubmitButton, TextAreaField, useAction, VIBE_OPTIONS } from "../_shared";

type SceneRow = { id: string; vibe: string; label: string; shotType: string; prompt: string; active: boolean; sort: number };
type Vibe = { id: string; label: string; tagline: string };

function SceneForm({ row, vibe, onDone }: { row?: SceneRow; vibe?: string; onDone?: () => void }) {
  const { busy, run } = useAction();
  return (
    <form
      className={FORM_GRID}
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
      <TextAreaField label="Scene prompt" name="prompt" defaultValue={row?.prompt} rows={2} hint="Continues the sentence 'Scene: she is …'" className="sm:col-span-2 lg:col-span-3" />
      <Field label="Sort" name="sort" type="number" defaultValue={row?.sort ?? 0} />
      <FormFooter submit={<SubmitButton busy={busy !== null}>{row ? "Save scene" : "Add scene"}</SubmitButton>}>
        <CheckField label="Live" name="active" defaultChecked={row?.active ?? true} />
      </FormFooter>
    </form>
  );
}

export function ReelSceneEditor({ rows, vibes }: { rows: SceneRow[]; vibes: Vibe[] }) {
  const { busy, run } = useAction();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState<string | null>(null);
  return (
    <div className="space-y-6">
      {vibes.map((vibe) => {
        const scenes = rows.filter((s) => s.vibe === vibe.id);
        return (
          <Section
            key={vibe.id}
            title={vibe.label}
            description={vibe.tagline}
            aside={
              <>
                <LiveCount live={scenes.filter((s) => s.active).length} total={scenes.length} noun="scenes" />
                <AddToggle open={adding === vibe.id} onToggle={() => setAdding(adding === vibe.id ? null : vibe.id)}>
                  New scene
                </AddToggle>
              </>
            }
          >
            {adding === vibe.id ? (
              <EditPanel title={`New ${vibe.label.toLowerCase()} scene`} className="mt-5">
                <SceneForm vibe={vibe.id} onDone={() => setAdding(null)} />
              </EditPanel>
            ) : null}
            <RowList>
              {scenes.length === 0 ? <li className="py-6 text-sm text-ink-3">No scenes yet. Reels fall back to the built-in nine for this vibe.</li> : null}
              {scenes.map((s, i) => (
                <Row
                  key={s.id}
                  leading={
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 font-display text-sm font-bold tabular-nums text-ink-2" aria-hidden="true">
                      {i + 1}
                    </span>
                  }
                  title={s.label}
                  id={s.id}
                  badges={
                    <>
                      <Badge tone="neutral">{SHOT_TYPE_OPTIONS.find((o) => o.value === s.shotType)?.label ?? s.shotType}</Badge>
                      <StatusBadge active={s.active} />
                    </>
                  }
                  meta={<Meta items={[`sort ${s.sort}`]} />}
                  actions={
                    <>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(editing === s.id ? null : s.id)} aria-expanded={editing === s.id}>
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
                    </>
                  }
                  expanded={editing === s.id ? <SceneForm row={s} onDone={() => setEditing(null)} /> : null}
                >
                  <p className="mt-1.5 text-sm leading-6 text-ink-2">
                    <span className="text-ink-3">She is</span> {s.prompt}
                  </p>
                </Row>
              ))}
            </RowList>
          </Section>
        );
      })}
    </div>
  );
}
