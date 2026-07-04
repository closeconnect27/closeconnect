import { Skeleton } from "@/components/ui/Skeleton";

export default function CommunityDetailLoading() {
  return (
    <div className="flex-1 pb-10">
      <Skeleton className="h-40 w-full rounded-none sm:h-52" />
      <div className="px-4 pt-6 sm:px-6">
        <Skeleton className="mb-3 h-6 w-32 rounded-full" />
        <Skeleton className="mb-2 h-9 w-2/3" />
        <Skeleton className="mb-4 h-4 w-1/2" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <Skeleton className="mt-8 h-12 w-32 rounded-full" />
      </div>
    </div>
  );
}
