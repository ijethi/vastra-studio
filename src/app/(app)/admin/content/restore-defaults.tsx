"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/primitives";
import { restoreDefaultContent } from "@/app/actions/content";
import { useAction } from "./_shared";

export function RestoreDefaults() {
  const { busy, run } = useAction();
  return (
    <div className="flex flex-col rounded-[var(--radius-card)] border border-dashed border-line-strong p-5">
      <p className="eyebrow">Built-in defaults</p>
      <p className="mt-5 text-sm font-semibold text-ink">Restore from the code</p>
      <p className="mt-1 text-xs leading-5 text-ink-3">
        Rewrites every default row (the 32 base models, 6 backdrops, 3 packs, 27 scenes and the app copy). Rows you added with other ids are kept; uploaded previews stay in storage but are detached.
      </p>
      <div className="mt-4">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy !== null}
          onClick={() => {
            if (!window.confirm("Overwrite the default rows with the built-in values?")) return;
            void run("restore", () => restoreDefaultContent(), "Defaults restored");
          }}
        >
          {busy ? <Spinner /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />} Restore defaults
        </Button>
      </div>
    </div>
  );
}
