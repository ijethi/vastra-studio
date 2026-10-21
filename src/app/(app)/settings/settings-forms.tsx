"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input, Label, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { inviteMember, removeMember, saveDefaults } from "@/app/actions/settings";
import { cn } from "@/lib/cn";

type Defaults = { defaultBaseModelId: string; defaultBackdrop: string; defaultVariations: number; watermarkEnabled: boolean; autoGenerate: boolean };

export function DefaultsForm({
  canEdit,
  baseModels,
  backdrops,
  values,
  plan,
}: {
  canEdit: boolean;
  baseModels: Array<{ id: string; label: string; imagePath: string }>;
  backdrops: Array<{ id: string; label: string; hex: string }>;
  values: Defaults;
  plan: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [v, setV] = React.useState<Defaults>(values);
  const [busy, setBusy] = React.useState(false);
  const selected = baseModels.find((m) => m.id === v.defaultBaseModelId);

  return (
    <Card className="p-6">
      <h2 className="text-xl">Your house look</h2>
      <p className="mt-1 text-sm text-ink-2">Used automatically for every new photo, so one upload is all it takes.</p>
      <form
        className="mt-6 space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const res = await saveDefaults(v);
          setBusy(false);
          if (!res.ok) return toast.push({ title: res.error, tone: "danger" });
          toast.push({ title: "Saved", tone: "success" });
          router.refresh();
        }}
      >
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" disabled={!canEdit} checked={v.autoGenerate} onChange={(e) => setV({ ...v, autoGenerate: e.target.checked })} />
          <span>
            <span className="font-medium text-ink">Start making the photo as soon as I upload</span>
            <span className="block text-ink-2">Turn off if you prefer to check the model and background first, every time.</span>
          </span>
        </label>
        <div>
          <Label htmlFor="default-model">Model</Label>
          <div className="flex items-center gap-4">
            <div className="image-frame h-24 w-16 shrink-0">{selected ? <Image src={selected.imagePath} alt="" width={64} height={96} className="h-full w-full object-cover" /> : null}</div>
            <select
              id="default-model"
              disabled={!canEdit}
              value={v.defaultBaseModelId}
              onChange={(e) => setV({ ...v, defaultBaseModelId: e.target.value })}
              className="h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-sm text-ink"
            >
              {baseModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label>Background</Label>
          <div className="flex flex-wrap gap-2">
            {backdrops.map((b) => (
              <button
                key={b.id}
                type="button"
                disabled={!canEdit}
                onClick={() => setV({ ...v, defaultBackdrop: b.id })}
                aria-pressed={v.defaultBackdrop === b.id}
                className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm", v.defaultBackdrop === b.id ? "border-accent bg-accent-soft text-accent" : "border-line-strong text-ink-2")}
              >
                <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: b.hex }} aria-hidden="true" />
                {b.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="default-variations">Versions per photo</Label>
          <div className="flex items-center gap-3">
            <Input id="default-variations" type="number" min={1} max={4} disabled={!canEdit} value={v.defaultVariations} onChange={(e) => setV({ ...v, defaultVariations: Number(e.target.value) })} className="w-24" />
            <span className="text-xs text-ink-2">2 versions cost 25 credits; each extra one is 10.</span>
          </div>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" disabled={!canEdit || plan === "trial"} checked={v.watermarkEnabled} onChange={(e) => setV({ ...v, watermarkEnabled: e.target.checked })} />
          <span>
            <span className="font-medium text-ink">Small boutique label on downloads</span>
            <span className="block text-ink-2">{plan === "trial" ? "Always on during the trial. Buy credits to remove it." : "A small label in the corner of every image."}</span>
          </span>
        </label>
        {canEdit ? (
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner /> : null} Save
          </Button>
        ) : (
          <p className="text-xs text-ink-3">Only owners and admins can change these.</p>
        )}
      </form>
    </Card>
  );
}

export function TeamPanel({
  canInvite,
  isOwner,
  currentUserId,
  members,
  pending,
}: {
  canInvite: boolean;
  isOwner: boolean;
  currentUserId: string;
  members: Array<{ id: string; role: string; name: string; email: string; userId: string }>;
  pending: Array<{ id: string; email: string; role: string }>;
}) {
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "member">("member");
  const [busy, setBusy] = React.useState(false);

  return (
    <Card className="p-6">
      <h2 className="text-xl">Team</h2>
      <p className="mt-1 text-sm text-ink-2">Staff can add photos and make images. Admins can also change settings and buy credits.</p>
      <ul className="mt-6 divide-y divide-line">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {m.name} {m.userId === currentUserId ? <span className="text-ink-3">(you)</span> : null}
              </p>
              <p className="truncate text-xs text-ink-2">{m.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={m.role === "owner" ? "accent" : "neutral"} className="capitalize">
                {m.role === "member" ? "staff" : m.role}
              </Badge>
              {isOwner && m.role !== "owner" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    const res = await removeMember(m.id);
                    if (!res.ok) return toast.push({ title: res.error, tone: "danger" });
                    router.refresh();
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{p.email}</p>
              <p className="text-xs text-ink-2">Invitation sent</p>
            </div>
            <Badge tone="warning" className="capitalize">
              {p.role === "member" ? "staff" : p.role}
            </Badge>
          </li>
        ))}
      </ul>
      {canInvite ? (
        <form
          className="mt-6 flex flex-col gap-3 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await inviteMember(email, role);
            setBusy(false);
            if (!res.ok) return toast.push({ title: res.error, tone: "danger" });
            toast.push({ title: "Invitation sent", body: email, tone: "success" });
            setEmail("");
            router.refresh();
          }}
        >
          <Input type="email" required placeholder="colleague@yourboutique.in" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email to invite" />
          <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "member")} className="h-11 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-sm" aria-label="Role">
            <option value="member">Staff</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner /> : null} Invite
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
