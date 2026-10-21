import { Skeleton } from "@/components/ui/primitives";

export function ReelSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-56" />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Skeleton className="h-28 lg:h-96" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
