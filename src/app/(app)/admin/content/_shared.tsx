"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/app/actions/garments";

/**
 * Small, plain building blocks for the content editors. Functional only; the
 * visual layer is restyled separately. Every editor is a native <form> whose
 * fields are read with FormData, so the pages stay light and work without
 * client state beyond "saving".
 */

export function Field({ label, name, defaultValue, type = "text", required, placeholder, hint, className }: { label: string; name: string; defaultValue?: string | number; type?: string; required?: boolean; placeholder?: string; hint?: string; className?: string }) {
  const id = React.useId();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type={type} defaultValue={defaultValue} required={required} placeholder={placeholder} className="mt-1" step={type === "number" ? "any" : undefined} />
      {hint ? <p className="mt-1 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function SelectField({ label, name, defaultValue, options, className }: { label: string; name: string; defaultValue?: string; options: Array<{ value: string; label: string }>; className?: string }) {
  const id = React.useId();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={name} defaultValue={defaultValue} className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CheckField({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  const id = React.useId();
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-ink">
      <input id={id} name={name} type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4" /> {label}
    </label>
  );
}

export function TextAreaField({ label, name, defaultValue, rows = 3, hint }: { label: string; name: string; defaultValue?: string; rows?: number; hint?: string }) {
  const id = React.useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} name={name} defaultValue={defaultValue} rows={rows} className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2 font-mono text-xs text-ink" />
      {hint ? <p className="mt-1 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

/** Reads a form into a plain object; checkboxes become booleans. */
export function formValues(form: HTMLFormElement): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const data = new FormData(form);
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement) || el.type !== "checkbox" || !el.name) continue;
    out[el.name] = el.checked;
  }
  for (const [k, v] of data.entries()) if (!(k in out)) out[k] = typeof v === "string" ? v : "";
  return out;
}

/**
 * Wraps a server action: shows a toast with the result, refreshes the page
 * on success, and disables the submit button while the action runs.
 */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = React.useCallback(
    async (key: string, action: () => Promise<ActionResult<unknown>>, success = "Saved") => {
      setBusy(key);
      try {
        const res = await action();
        if (!res.ok) {
          toast.push({ title: res.error, tone: "danger" });
          return false;
        }
        toast.push({ title: success, tone: "success" });
        router.refresh();
        return true;
      } catch (err) {
        toast.push({ title: err instanceof Error ? err.message : "Something went wrong", tone: "danger" });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [router, toast],
  );
  return { busy, run };
}

export function SubmitButton({ busy, children = "Save", variant = "primary" }: { busy: boolean; children?: React.ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <Button type="submit" variant={variant} size="sm" disabled={busy}>
      {busy ? <Spinner /> : null} {children}
    </Button>
  );
}

export function DangerButton({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClick} className="text-danger">
      {children}
    </Button>
  );
}

export const BODY_TYPE_OPTIONS = [
  { value: "slim", label: "Slim" },
  { value: "regular", label: "Regular" },
  { value: "curvy", label: "Curvy" },
  { value: "plus", label: "Plus" },
];
export const SKIN_TONE_OPTIONS = [
  { value: "fair", label: "Fair" },
  { value: "wheatish", label: "Wheatish" },
  { value: "dusky", label: "Dusky" },
  { value: "deep", label: "Deep" },
];
export const AGE_OPTIONS = [
  { value: "20s", label: "20s" },
  { value: "30s", label: "30s" },
  { value: "40s", label: "40s" },
];
export const POSE_OPTIONS = [
  { value: "front", label: "Front" },
  { value: "three-quarter", label: "Three-quarter" },
];
export const BACKDROP_KIND_OPTIONS = [
  { value: "studio", label: "Studio" },
  { value: "interior", label: "Interior" },
  { value: "outdoor", label: "Outdoor" },
  { value: "festive", label: "Festive" },
];
export const VIBE_OPTIONS = [
  { value: "everyday", label: "Everyday" },
  { value: "festive", label: "Festive" },
  { value: "editorial", label: "Editorial" },
];
export const SHOT_TYPE_OPTIONS = [
  { value: "wide-hook", label: "Wide hook" },
  { value: "full-body", label: "Full body" },
  { value: "movement", label: "Movement" },
  { value: "detail", label: "Detail" },
  { value: "hero-portrait", label: "Hero portrait" },
];
