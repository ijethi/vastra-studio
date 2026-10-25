"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { saveAppContent } from "@/app/actions/content";
import { SubmitButton, useAction } from "../_shared";

type Entry = { key: string; description: string; json: string; defaults: string; updatedAt: string | null; updatedBy: string | null };

function CopyForm({ entry }: { entry: Entry }) {
  const { busy, run } = useAction();
  const [value, setValue] = React.useState(entry.json);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();
  const dirty = value !== entry.json;
  return (
    <form
      className="mt-5"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          JSON.parse(value);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Invalid JSON");
          return;
        }
        setError(null);
        await run(entry.key, () => saveAppContent(entry.key, value));
      }}
    >
      <label htmlFor={id} className="sr-only">
        {entry.key} JSON
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={Math.min(24, Math.max(6, value.split("\n").length + 1))}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        className="block w-full resize-y rounded-[20px] border border-transparent bg-surface-2 px-4 py-3 font-mono text-xs leading-6 text-ink transition-colors focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/15"
      />
      {error ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-xs text-ink-3">
          {entry.updatedAt ? (
            <>
              Saved {entry.updatedAt}
              {entry.updatedBy ? ` by ${entry.updatedBy}` : ""}
            </>
          ) : (
            "Built-in value, never edited"
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setValue(entry.defaults)} disabled={value === entry.defaults}>
            Reset to built-in
          </Button>
          <SubmitButton busy={busy !== null}>{dirty ? "Save changes" : "Save"}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function AppCopyEditor({ entries }: { entries: Entry[] }) {
  return (
    <ul className="space-y-6">
      {entries.map((entry) => (
        <li key={entry.key}>
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-mono text-base font-semibold tracking-tight text-ink">{entry.key}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-2">{entry.description}</p>
              </div>
              <Badge tone={entry.updatedAt ? "accent" : "neutral"} className="shrink-0 self-start">
                {entry.updatedAt ? "Edited" : "Built-in"}
              </Badge>
            </div>
            {/* Keyed on the saved JSON so a refresh after saving remounts the form with the stored value. */}
            <CopyForm key={`${entry.key}:${entry.json}`} entry={entry} />
          </Card>
        </li>
      ))}
    </ul>
  );
}
