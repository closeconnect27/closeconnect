import { Skeleton } from "@/components/ui/Skeleton";

// Shape matches CommunityCard exactly (image block, title line, secondary
// line) so the loading state doesn't visually jump when real content
// replaces it.
export function CommunityCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-bg2">
      <Skeleton className="h-72 w-full rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  );
}
