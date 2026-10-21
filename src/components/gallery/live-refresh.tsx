"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the gallery every few seconds while any photo is still being made. */
export function LiveRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
