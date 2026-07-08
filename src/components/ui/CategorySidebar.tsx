"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";

/**
 * Category filter, replacing the old horizontal Netflix-style rows
 * (one per category) with a single always-shown grid filtered from here.
 * A community/event matches a category as primary OR extra (the existing
 * getCommunitiesByCategory/getCommunities .or() logic, unchanged) -- this
 * only drives the `category` URL param, same mechanism the old pill row
 * used.
 *
 * Two separate exports, not one component with responsive show/hide,
 * because they sit in different places in the page layout (the mobile
 * pill row spans full width above the filter bar; the desktop list is a
 * sidebar column inside the same flex row as the grid) -- toggling
 * visibility on one shared node can't relocate it between those two
 * positions in the DOM.
 */
function useCategorySelect(basePath: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get("category") ?? "";

  function select(category: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (category) params.set("category", category);
    else params.delete("category");
    router.push(`${basePath}${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return { active, select };
}

export function CategorySidebarMobile({ basePath }: { basePath: string }) {
  const { active, select } = useCategorySelect(basePath);

  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto border-b border-border px-4 pb-3 sm:px-6 md:hidden">
      <CategoryPill label="All" active={active === ""} onClick={() => select("")} />
      {CATEGORIES.map((c) => (
        <CategoryPill
          key={c.slug}
          label={c.label}
          icon={c.icon}
          active={active === c.slug}
          onClick={() => select(c.slug)}
        />
      ))}
    </div>
  );
}

export function CategorySidebarDesktop({ basePath }: { basePath: string }) {
  const { active, select } = useCategorySelect(basePath);

  return (
    <aside className="hidden w-56 shrink-0 md:block">
      <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Categories</h2>
      <nav className="flex flex-col gap-1">
        <SidebarItem label="All categories" active={active === ""} onClick={() => select("")} />
        {CATEGORIES.map((c) => (
          <SidebarItem
            key={c.slug}
            label={c.label}
            icon={c.icon}
            active={active === c.slug}
            onClick={() => select(c.slug)}
          />
        ))}
      </nav>
    </aside>
  );
}

function CategoryPill({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-b-2 px-3 py-2 font-mono text-[12px] font-semibold transition ${
        active ? "border-green text-green" : "border-transparent text-text3 hover:text-text2"
      }`}
    >
      {Icon && <Icon size={14} />}
      {label}
    </button>
  );
}

function SidebarItem({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-card-sm px-3 py-2 text-left text-[13px] font-medium transition ${
        active ? "bg-green-tint text-green" : "text-text2 hover:bg-bg2"
      }`}
    >
      {Icon && <Icon size={16} />}
      {label}
    </button>
  );
}
