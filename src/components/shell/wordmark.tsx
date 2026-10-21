import { cn } from "@/lib/cn";

/** Wordmark: a folded-cloth mark in rani pink with the name in the display face. */
export function Wordmark({ large, onDark }: { large?: boolean; onDark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden="true" className={cn("relative block overflow-hidden rounded-[30%]", large ? "h-9 w-9" : "h-7 w-7")}>
        <span className="absolute inset-0 bg-accent" />
        <span className="absolute inset-0 origin-bottom-left -skew-y-[18deg] translate-y-1/2 bg-gold/90" />
      </span>
      <span className={cn("font-display font-bold tracking-tight", large ? "text-2xl" : "text-lg", onDark ? "text-night-ink" : "text-ink")}>
        Vastra <span className={onDark ? "text-night-ink-2" : "text-ink-2"}>Studio</span>
      </span>
    </span>
  );
}
