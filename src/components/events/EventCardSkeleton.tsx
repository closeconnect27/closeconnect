import { Skeleton } from "@/components/ui/Skeleton";

export function EventCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-bg2">
      <Skeleton className="h-72 w-full rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}
