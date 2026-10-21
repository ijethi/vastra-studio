"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "radix-ui";
import { Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { setProviderEnabled } from "@/app/actions/admin";
import type { TryOnProviderName } from "@/env";
import type { ProviderSwitches } from "@/lib/providers/tryon";

export function ProviderSwitchesPanel({ providers, switches }: { providers: TryOnProviderName[]; switches: ProviderSwitches }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <Card className="p-6">
      <h2 className="text-xl">Try-on providers</h2>
      <p className="mt-1 text-sm text-ink-2">In priority order. Switch one off to drain it in seconds; traffic falls through to the next.</p>
      <ul className="mt-5 divide-y divide-line">
        {providers.map((p, i) => {
          const enabled = switches[p]?.enabled !== false;
          return (
            <li key={p} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium capitalize text-ink">
                  {p} <span className="ml-2 text-xs font-normal text-ink-3">{i === 0 ? "primary" : `fallback ${i}`}</span>
                </p>
              </div>
              <Switch.Root
                checked={enabled}
                aria-label={`${p} enabled`}
                onCheckedChange={async (v) => {
                  const res = await setProviderEnabled(p, v);
                  if (!res.ok) return toast.push({ title: res.error, tone: "danger" });
                  router.refresh();
                }}
                className="relative h-6 w-11 rounded-full bg-surface-3 transition-colors data-[state=checked]:bg-accent"
              >
                <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-[22px]" />
              </Switch.Root>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
