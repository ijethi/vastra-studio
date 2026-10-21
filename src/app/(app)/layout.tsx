import { Suspense } from "react";
import { AppShell, AppShellFallback } from "@/components/shell/app-shell";
import { ToastProvider } from "@/components/ui/toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <Suspense fallback={<AppShellFallback />}>
        <AppShell>{children}</AppShell>
      </Suspense>
    </ToastProvider>
  );
}
