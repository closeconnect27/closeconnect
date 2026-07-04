import { Skeleton } from "@/components/ui/Skeleton";
import { CommunityCardSkeleton } from "@/components/communities/CommunityCardSkeleton";

export default function SearchLoading() {
  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <Skeleton className="mb-2 h-9 w-32" />
      <Skeleton className="mb-6 h-4 w-56" />
      <Skeleton className="h-12 w-full rounded-full" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <CommunityCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
