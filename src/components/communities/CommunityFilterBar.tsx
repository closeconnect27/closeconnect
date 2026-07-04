"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";
import { CategoryImage } from "@/components/ui/CategoryImage";

const CITIES = ["Bengaluru", "Mumbai", "Delhi", "Chennai", "Hyderabad", "Pune"];

export function CommunityFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category") ?? "";
  const activeCity = searchParams.get("city") ?? "";
  const activeKind = searchParams.get("kind") ?? "";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/communities${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-border px-4 sm:px-5">
        <button
          onClick={() => setParam("category", "")}
          className={`whitespace-nowrap border-b-2 px-4 py-2 text-[13px] font-medium ${
            activeCategory === "" ? "border-green text-green" : "border-transparent text-text3"
          }`}
        >
          all
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.slug}
            onClick={() => setParam("category", c.slug)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-[13px] font-medium ${
              activeCategory === c.slug ? "border-green text-green" : "border-transparent text-text3"
            }`}
          >
            <CategoryImage slug={c.slug} seed={0} alt="" size={16} className="rounded-full object-cover" />
            {c.slug}
          </button>
        ))}
      </div>
      <div className="flex gap-2 px-4 sm:px-5">
        <select
          value={activeCity}
          onChange={(e) => setParam("city", e.target.value)}
          className="rounded-full border border-border2 bg-bg3 px-3 py-1.5 text-[13px] font-medium text-text2"
        >
          <option value="">all cities</option>
          {CITIES.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        <select
          value={activeKind}
          onChange={(e) => setParam("kind", e.target.value)}
          className="rounded-full border border-border2 bg-bg3 px-3 py-1.5 text-[13px] font-medium text-text2"
        >
          <option value="">native + external</option>
          <option value="native">native only</option>
          <option value="external">external only</option>
        </select>
      </div>
    </div>
  );
}
