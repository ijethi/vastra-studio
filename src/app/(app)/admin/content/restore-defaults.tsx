"use client";

import { Button } from "@/components/ui/button";
import { Card, Spinner } from "@/components/ui/primitives";
import { restoreDefaultContent } from "@/app/actions/content";
import { useAction } from "./_shared";

export function RestoreDefaults() {
  const { busy, run } = useAction();
  return (
    <Card className="border-dashed p-5">
      <p className="text-sm font-medium text-ink">Restore the built-in defaults</p>
      <p className="mt-1 text-xs text-ink-2">
        Rewrites every default row (the 32 base models, 6 backdrops, 3 packs, 27 scenes and the app copy) from the code. Rows you added with other ids are kept; uploaded previews stay in storage but are detached.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-3"
        disabled={busy !== null}
        onClick={() => {
          if (!window.confirm("Overwrite the default rows with the built-in values?")) return;
          void run("restore", () => restoreDefaultContent(), "Defaults restored");
        }}
      >
        {busy ? <Spinner /> : null} Restore defaults
      </Button>
    </Card>
  );
}
