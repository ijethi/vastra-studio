"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type Toast = { id: number; title: string; body?: string; tone: "neutral" | "success" | "danger" };

const ToastContext = React.createContext<{ push: (t: Omit<Toast, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const push = React.useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 text-sm shadow-[var(--shadow-lg)] fade-up",
              t.tone === "success" && "border-transparent bg-success-soft text-success",
              t.tone === "danger" && "border-transparent bg-danger-soft text-danger",
              t.tone === "neutral" && "border-line bg-surface text-ink",
            )}
          >
            <p className="font-semibold">{t.title}</p>
            {t.body ? <p className="mt-0.5 opacity-90">{t.body}</p> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
