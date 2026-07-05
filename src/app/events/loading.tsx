import { Skeleton } from "@/components/ui/Skeleton";
import { EventCardSkeleton } from "@/components/events/EventCardSkeleton";

export default function EventsLoading() {
  return (
    <div className="flex-1 pb-16">
      <div className="flex items-start justify-between gap-4 px-4 pb-6 pt-8 sm:px-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>

      <div className="flex gap-2 border-b border-border px-4 pb-4 sm:px-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-8">
        {Array.from({ length: 3 }).map((_, row) => (
          <section key={row} className="px-4 sm:px-6">
            <Skeleton className="mb-4 h-5 w-40" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="w-56 shrink-0">
                  <EventCardSkeleton />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
