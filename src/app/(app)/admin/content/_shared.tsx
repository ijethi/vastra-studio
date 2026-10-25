"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input, Label, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { ActionResult } from "@/app/actions/garments";

/**
 * Building blocks for the content editors, in the Daylight look used by the
 * rest of the app: one card per catalogue, a hairline-divided list of rows,
 * and an inset tile that opens under a row (or at the top of the list) for
 * editing. Every editor is a native <form> whose fields are read with
 * FormData, so the pages stay light and work without client state beyond
 * "saving".
 */

const CONTROL = "h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-4 text-sm text-ink transition-colors focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:opacity-60";

export function Field({ label, name, defaultValue, type = "text", required, placeholder, hint, className }: { label: string; name: string; defaultValue?: string | number; type?: string; required?: boolean; placeholder?: string; hint?: string; className?: string }) {
  const id = React.useId();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type={type} defaultValue={defaultValue} required={required} placeholder={placeholder} className="h-11 text-sm" step={type === "number" ? "any" : undefined} />
      {hint ? <p className="mt-1.5 text-xs leading-5 text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function SelectField({ label, name, defaultValue, options, className }: { label: string; name: string; defaultValue?: string; options: Array<{ value: string; label: string }>; className?: string }) {
  const id = React.useId();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} name={name} defaultValue={defaultValue} className={CONTROL}>
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
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink">
      <input id={id} name={name} type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

export function TextAreaField({ label, name, defaultValue, rows = 3, hint, className }: { label: string; name: string; defaultValue?: string; rows?: number; hint?: string; className?: string }) {
  const id = React.useId();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} name={name} defaultValue={defaultValue} rows={rows} className={cn(CONTROL, "h-auto resize-y py-2.5 leading-6")} />
      {hint ? <p className="mt-1.5 text-xs leading-5 text-ink-3">{hint}</p> : null}
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
    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClick} className="text-ink-3 hover:bg-danger-soft hover:text-danger">
      {children}
    </Button>
  );
}

/* ------------------------------ layout ------------------------------ */

/** One card per catalogue: title, a line of context, counts and the "New" button on the right. */
export function Section({ title, description, aside, children, className }: { title: React.ReactNode; description?: React.ReactNode; aside?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-2">{description}</p> : null}
        </div>
        {aside ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">{aside}</div> : null}
      </div>
      {children}
    </Card>
  );
}

/** "6 live · 6 total" in the quiet teal the app uses for status. */
export function LiveCount({ live, total, noun }: { live: number; total: number; noun?: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-teal-soft px-3.5 text-xs font-semibold tabular-nums text-teal">
      {live} live
      <span aria-hidden="true" className="opacity-50">
        ·
      </span>
      {total} {noun ?? "total"}
    </span>
  );
}

/** The "New backdrop" / "Close" toggle that opens the add form at the top of a list. */
export function AddToggle({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant={open ? "secondary" : "night"} size="sm" onClick={onToggle} aria-expanded={open}>
      {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      {open ? "Close" : children}
    </Button>
  );
}

/** Hairline-divided list that sits under a Section header. */
export function RowList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("mt-5 divide-y divide-line border-t border-line", className)}>{children}</ul>;
}

/**
 * One catalogue row. On a laptop the leading visual, body and actions sit on
 * one line; on a phone the actions drop under the body. `expanded` renders
 * an inset editing tile beneath the row.
 */
export function Row({ leading, title, id, badges, meta, children, actions, expanded, className }: { leading?: React.ReactNode; title: React.ReactNode; id?: string; badges?: React.ReactNode; meta?: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode; expanded?: React.ReactNode; className?: string }) {
  return (
    <li className={cn("py-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex min-w-0 flex-1 gap-4">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-semibold text-ink">{title}</p>
              {id ? <IdChip>{id}</IdChip> : null}
              {badges}
            </div>
            {meta ? <div className="mt-1 text-xs leading-5 text-ink-3">{meta}</div> : null}
            {children}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1 sm:-mt-1">{actions}</div> : null}
      </div>
      {expanded ? <EditPanel>{expanded}</EditPanel> : null}
    </li>
  );
}

export function IdChip({ children }: { children: React.ReactNode }) {
  return <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-3">{children}</code>;
}

export function StatusBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? "success" : "neutral"}>{active ? "Live" : "Hidden"}</Badge>;
}

/** Inline facts separated by a quiet middle dot; empty items are skipped. */
export function Meta({ items }: { items: Array<React.ReactNode | false | null | undefined> }) {
  const shown = items.filter((i) => i !== false && i !== null && i !== undefined && i !== "");
  return (
    <>
      {shown.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <span aria-hidden="true" className="mx-1.5 text-line-strong">
              ·
            </span>
          ) : null}
          {item}
        </React.Fragment>
      ))}
    </>
  );
}

/** Inset tile that holds an add or edit form. */
export function EditPanel({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mt-4 rounded-[20px] bg-surface-2 p-4 sm:p-5", className)}>
      {title ? <p className="eyebrow mb-4">{title}</p> : null}
      {children}
    </div>
  );
}

/** Four columns on a laptop, two on a tablet, one on a phone. */
export const FORM_GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-4";

/** Bottom row of a form: toggles on the left, the submit on the right. */
export function FormFooter({ children, submit }: { children?: React.ReactNode; submit: React.ReactNode }) {
  return (
    <div className="col-span-full mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-4">{children}</div>
      {submit}
    </div>
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
