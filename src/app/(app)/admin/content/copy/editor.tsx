"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { saveAppContent } from "@/app/actions/content";
import { SubmitButton, useAction } from "../_shared";

type Entry = { key: string; description: string; json: string; defaults: string; updatedAt: string | null; updatedBy: string | null };

function CopyForm({ entry }: { entry: Entry }) {
  const { busy, run } = useAction();
  const [value, setValue] = React.useState(entry.json);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();
  return (
    <form
      className="space-y-2"
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
      <textarea id={id} value={value} onChange={(e) => setValue(e.target.value)} rows={Math.min(24, Math.max(6, value.split("\n").length + 1))} spellCheck={false} className="block w-full rounded-xl border border-line bg-surface px-3 py-2 font-mono text-xs text-ink" />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton busy={busy !== null}>Save</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setValue(entry.defaults)}>
          Reset to built-in
        </Button>
        {entry.updatedAt ? (
          <span className="text-xs text-ink-3">
            Saved {entry.updatedAt}
            {entry.updatedBy ? ` by ${entry.updatedBy}` : ""}
          </span>
        ) : null}
      </div>
    </form>
  );
}

export function AppCopyEditor({ entries }: { entries: Entry[] }) {
  return (
    <ul className="space-y-4">
      {entries.map((entry) => (
        <li key={entry.key}>
          <Card className="p-4">
            <p className="text-sm font-medium text-ink">
              <code>{entry.key}</code>
            </p>
            <p className="mb-3 mt-1 text-xs text-ink-2">{entry.description}</p>
            {/* Keyed on the saved JSON so a refresh after saving remounts the form with the stored value. */}
            <CopyForm key={`${entry.key}:${entry.json}`} entry={entry} />
          </Card>
        </li>
      ))}
    </ul>
  );
}
