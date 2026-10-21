"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input, Label, Alert, Spinner } from "@/components/ui/primitives";

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "boutique";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [name, setName] = React.useState(defaultName);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (clean.length < 2) return setError("Give your boutique a name of at least two characters.");
    setBusy(true);
    setError(null);
    const { data, error } = await authClient.organization.create({ name: clean, slug: slugify(clean) });
    if (error || !data) {
      setBusy(false);
      return setError(error?.message ?? "Could not create the boutique. Please try again.");
    }
    await authClient.organization.setActive({ organizationId: data.id });
    router.push("/studio");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div>
        <Label htmlFor="name">Boutique name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meera Couture" maxLength={60} required autoFocus />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Spinner /> : null} Open my studio
      </Button>
    </form>
  );
}
