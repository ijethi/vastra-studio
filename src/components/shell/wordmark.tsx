import { cn } from "@/lib/cn";

/** Wordmark: a coral mark with a folded corner (a hem turned over) and the name. */
export function Wordmark({ large, onDark }: { large?: boolean; onDark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden="true" className={cn("relative block overflow-hidden", large ? "h-9 w-9 rounded-[12px]" : "h-7 w-7 rounded-[9px]")}>
        <span className="absolute inset-0 bg-accent" />
        <span className="absolute -right-1/3 -top-1/3 h-2/3 w-2/3 rotate-45 bg-gold" />
      </span>
      <span className={cn("font-display font-extrabold tracking-tight", large ? "text-2xl" : "text-lg", onDark ? "text-night-ink" : "text-ink")}>
        Vastra <span className={onDark ? "text-night-ink-2" : "text-ink-2"}>Studio</span>
      </span>
    </span>
  );
}
