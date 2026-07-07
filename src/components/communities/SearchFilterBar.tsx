"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";
import { CITY_OPTIONS } from "@/lib/cities";
import { Combobox } from "@/components/ui/Combobox";

const TYPE_OPTIONS = [
  { value: "communities", label: "Communities only" },
  { value: "events", label: "Events only" },
];
const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({ value: c.slug, label: c.label }));

export function SearchFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/search${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Combobox
        value={searchParams.get("type") ?? ""}
        onChange={(v) => setParam("type", v)}
        options={TYPE_OPTIONS}
        placeholder="Communities + events"
      />
      <Combobox
        value={searchParams.get("category") ?? ""}
        onChange={(v) => setParam("category", v)}
        options={CATEGORY_OPTIONS}
        placeholder="All categories"
      />
      <Combobox
        value={searchParams.get("city") ?? ""}
        onChange={(v) => setParam("city", v)}
        options={CITY_OPTIONS}
        placeholder="All cities"
      />
    </div>
  );
}
