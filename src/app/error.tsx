"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 text-center">
      <h1 className="display-lg">Something went wrong</h1>
      <p className="mt-3 text-sm leading-6 text-ink-2">Your work is saved. Try again, and if it keeps happening, tell us.</p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
