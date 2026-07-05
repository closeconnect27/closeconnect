import { Skeleton } from "@/components/ui/Skeleton";

export default function HostDashboardLoading() {
  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-10 w-24 rounded-full" />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-card" />
          ))}
        </div>

        {Array.from({ length: 2 }).map((_, section) => (
          <div key={section} className="mt-8">
            <Skeleton className="mb-3 h-4 w-32" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] rounded-card" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
