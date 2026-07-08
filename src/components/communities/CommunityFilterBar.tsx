"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Combobox } from "@/components/ui/Combobox";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { CITY_OPTIONS } from "@/lib/cities";

// Category moved to CategorySidebar -- this is now just the top filter row:
// Type (community_type: online/offline/both), City (multi-select, matches
// primary-or-extra same as the sidebar's category logic), and native/external
// (kept -- it isn't in the reference layout, but nothing gets dropped here).
const TYPE_OPTIONS = [
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "both", label: "Both" },
];
const KIND_OPTIONS = [
  { value: "native", label: "Native only" },
  { value: "external", label: "External only" },
];

export function CommunityFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeType = searchParams.get("type") ?? "";
  const activeKind = searchParams.get("kind") ?? "";

  // Local state for the multi-select, not read from searchParams on every
  // render -- router.push() resolves asynchronously, and pushing once per
  // click means several in-flight navigations racing each other; whichever
  // resolves last wins, which isn't necessarily the last one clicked. Local
  // state updates synchronously between clicks so the UI and the
  // accumulating selection are never wrong; the actual URL push is
  // debounced (below) so only one navigation is ever in flight, removing
  // the race instead of just narrowing it.
  //
  // Synced from the URL during render ("adjusting state when a prop
  // changes", react.dev's own pattern for this -- a *state* variable
  // tracking the last-seen param, not a ref: refs can't be read/written
  // during render at all, only state can, conditioned on a real change to
  // avoid looping). Not an effect -- an effect would set state a whole
  // commit later, missing this render entirely (e.g. back/forward
  // navigation would flash the previous selection for a frame), and
  // reintroduces the cascading-render shape the debounce below was added
  // to avoid in the first place.
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
    router.push(`/communities${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function updateCities(next: string[]) {
    setCities(next);
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => setParam("city", next.join(",")), 250);
  }

  return (
    <div className="flex flex-wrap gap-2 px-4 sm:px-6">
      <Combobox value={activeType} onChange={(v) => setParam("type", v)} options={TYPE_OPTIONS} placeholder="Online + offline" />
      <MultiCombobox values={cities} onChange={updateCities} options={CITY_OPTIONS} placeholder="All cities" />
      <Combobox value={activeKind} onChange={(v) => setParam("kind", v)} options={KIND_OPTIONS} placeholder="Native + external" />
    </div>
  );
}
