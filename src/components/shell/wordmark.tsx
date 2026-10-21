export function Wordmark({ large }: { large?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={large ? "h-9 w-9 rounded-[10px] bg-accent" : "h-7 w-7 rounded-lg bg-accent"}
        style={{ clipPath: "polygon(50% 0, 100% 38%, 82% 100%, 18% 100%, 0 38%)" }}
      />
      <span className={`font-display ${large ? "text-2xl" : "text-lg"} tracking-tight text-ink`}>
        Vastra <span className="text-ink-2">Studio</span>
      </span>
    </span>
  );
}
