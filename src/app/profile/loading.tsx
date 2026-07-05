import { Skeleton } from "@/components/ui/Skeleton";

export default function ProfileLoading() {
  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Skeleton className="h-[86px] rounded-card" />
        {Array.from({ length: 2 }).map((_, section) => (
          <div key={section} className="mt-8">
            <Skeleton className="mb-3 h-4 w-32" />
            <Skeleton className="mb-2 h-4 w-16" />
            <div className="mb-6 flex flex-col gap-2">
              <Skeleton className="h-[72px] rounded-card" />
            </div>
            <Skeleton className="mb-2 h-4 w-16" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-[72px] rounded-card" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
