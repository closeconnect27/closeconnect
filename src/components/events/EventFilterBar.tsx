"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";
import { CategoryImage } from "@/components/ui/CategoryImage";
import { EventDateRangeCalendar } from "@/components/events/EventDateRangeCalendar";

const CITIES = ["Bengaluru", "Mumbai", "Delhi", "Chennai", "Hyderabad", "Pune"];

export function EventFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category") ?? "";
  const activeCity = searchParams.get("city") ?? "";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/events${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="scrollbar-none flex gap-2 overflow-x-auto border-b border-border px-4 sm:px-6">
        <button
          onClick={() => setParam("category", "")}
          className={`whitespace-nowrap border-b-2 px-4 py-2 text-[13px] font-medium transition ${
            activeCategory === "" ? "border-green text-green" : "border-transparent text-text3 hover:text-text2"
          }`}
        >
          all
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.slug}
            onClick={() => setParam("category", c.slug)}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 text-[13px] font-medium transition ${
              activeCategory === c.slug ? "border-green text-green" : "border-transparent text-text3 hover:text-text2"
            }`}
          >
            <CategoryImage slug={c.slug} seed={0} alt="" size={16} className="rounded-full object-cover" />
            {c.slug}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 px-4 sm:px-6">
        <select
          value={activeCity}
          onChange={(e) => setParam("city", e.target.value)}
          className="rounded-full border border-border2 bg-bg3 px-4 py-2 text-[13px] font-medium text-text2 transition hover:border-green"
        >
          <option value="">all cities</option>
          {CITIES.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        <EventDateRangeCalendar />
      </div>
    </div>
  );
}
