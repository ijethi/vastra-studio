"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * The signature element: the owner's real shop photo on the left, the
 * on-model result on the right, with a handle you drag. It sweeps once on
 * load so the point lands without anyone touching it.
 */
export function CompareSlider({
  before,
  after,
  beforeLabel = "Shop photo",
  afterLabel = "On a model",
  className,
  autoplay = true,
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  autoplay?: boolean;
}) {
  const [pos, setPos] = React.useState(18);
  const [touched, setTouched] = React.useState(false);
  const frameRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!autoplay || touched) return;
    let raf = 0;
    const delay = setTimeout(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setPos(55);
        return;
      }
      const start = performance.now();
      const duration = 1800;
      const from = 18;
      const to = 58;
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setPos(from + (to - from) * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, 500);
    return () => {
      clearTimeout(delay);
      cancelAnimationFrame(raf);
    };
  }, [autoplay, touched]);

  function fromPointer(e: React.PointerEvent) {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(3, Math.min(97, x)));
  }

  return (
    <div
      ref={frameRef}
      className={cn("image-frame relative aspect-[3/4] select-none touch-none", className)}
      onPointerDown={(e) => {
        setTouched(true);
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && fromPointer(e)}
    >
      <Image src={after} alt={afterLabel} fill sizes="(min-width: 1024px) 520px, 90vw" className="object-cover" priority />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <Image src={before} alt={beforeLabel} fill sizes="(min-width: 1024px) 520px, 90vw" className="object-cover" priority />
      </div>

      <span className="absolute left-3 top-3 rounded-full bg-night/80 px-2.5 py-1 text-[11px] font-semibold text-night-ink backdrop-blur">{beforeLabel}</span>
      <span className="absolute right-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-on-accent">{afterLabel}</span>

      <div className="pointer-events-none absolute inset-y-0" style={{ left: `calc(${pos}% - 1px)` }}>
        <div className="h-full w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" />
        <div className="absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-night shadow-[var(--shadow-lg)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6 3 12l6 6M15 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <input
        type="range"
        min={3}
        max={97}
        value={Math.round(pos)}
        onChange={(e) => {
          setTouched(true);
          setPos(Number(e.target.value));
        }}
        aria-label="Compare shop photo with the on-model result"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
