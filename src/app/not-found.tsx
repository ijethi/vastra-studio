import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shell/wordmark";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 text-center">
      <Wordmark />
      <h1 className="display-lg mt-10">That page is not here</h1>
      <p className="mt-3 text-sm leading-6 text-ink-2">The link may be old, or the piece may have been deleted.</p>
      <Button asChild className="mt-6">
        <Link href="/studio">Back to the studio</Link>
      </Button>
    </div>
  );
}
