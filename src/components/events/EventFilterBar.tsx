"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { EventDateRangeCalendar } from "@/components/events/EventDateRangeCalendar";
import { CITY_OPTIONS } from "@/lib/cities";

// Category moved to CategorySidebar -- this is now just the top filter row:
// City (multi-select) and the existing drag-select date range calendar.
// Events have no online/offline field the way communities do, so there's
// no Type control here. community/host filters still work (used for
// deep links from a community page or a host's own listings) but aren't
// surfaced as top-bar controls -- they never were.
export function EventFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local state, not read from searchParams on every render -- see
  // CommunityFilterBar's matching comment: several in-flight router.push()
  // navigations race each other, and whichever resolves last wins (not
  // necessarily the last one clicked). The push is debounced so only one
  // navigation is ever in flight, removing the race rather than narrowing
  // it, and synced from the URL during render via a tracked-state
  // comparison (react.dev's "adjusting state when a prop changes"
  // pattern), not an effect or a ref -- see CommunityFilterBar for why.
  const cityParam = searchParams.get("city") ?? "";
  const [cities, setCities] = useState<string[]>(() => (cityParam ? cityParam.split(",").filter(Boolean) : []));
  const [lastCityParam, setLastCityParam] = useState(cityParam);
  if (lastCityParam !== cityParam) {
    setLastCityParam(cityParam);
    setCities(cityParam ? cityParam.split(",").filter(Boolean) : []);
  }

  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/events${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function updateCities(next: string[]) {
    setCities(next);
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => setParam("city", next.join(",")), 250);
  }

  return (
    <div className="flex flex-wrap gap-2 px-4 sm:px-6">
      <MultiCombobox values={cities} onChange={updateCities} options={CITY_OPTIONS} placeholder="All cities" />
      <EventDateRangeCalendar />
    </div>
  );
}
