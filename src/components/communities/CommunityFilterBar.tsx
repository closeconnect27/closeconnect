"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";
import { CategoryImage } from "@/components/ui/CategoryImage";
import { Combobox } from "@/components/ui/Combobox";
import { CITY_OPTIONS } from "@/lib/cities";

const KIND_OPTIONS = [
  { value: "native", label: "Native only" },
  { value: "external", label: "External only" },
];

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
    <div className="flex flex-col gap-4">
      <div className="scrollbar-none flex gap-2 overflow-x-auto border-b border-border px-4 sm:px-6">
        <button
          onClick={() => setParam("category", "")}
          className={`whitespace-nowrap border-b-2 px-4 py-2 font-mono text-[12px] font-semibold transition ${
            activeCategory === "" ? "border-green text-green" : "border-transparent text-text3 hover:text-text2"
          }`}
        >
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.slug}
            onClick={() => setParam("category", c.slug)}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 font-mono text-[12px] font-semibold transition ${
              activeCategory === c.slug ? "border-green text-green" : "border-transparent text-text3 hover:text-text2"
            }`}
          >
            <CategoryImage slug={c.slug} seed={0} alt="" size={16} className="rounded-full object-cover" />
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 px-4 sm:px-6">
        <Combobox value={activeCity} onChange={(v) => setParam("city", v)} options={CITY_OPTIONS} placeholder="All cities" />
        <Combobox value={activeKind} onChange={(v) => setParam("kind", v)} options={KIND_OPTIONS} placeholder="Native + external" />
      </div>
    </div>
  );
}
