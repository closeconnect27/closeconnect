"use client";

import { useMemo, useState } from "react";
import { IconSearch, IconChevronDown } from "@tabler/icons-react";
import { track } from "@/lib/mixpanel/client";
import { PLATFORM_FAQ_CATEGORIES, PLATFORM_FAQ_CATEGORY_LABELS, type PlatformFaq } from "@/lib/platformFaqs";

/** Public /faqs -- search across question/answer/category (client-side:
 * a few dozen rows at most, no need for real search infrastructure, per
 * the spec this was built from), plus a category filter row. Only
 * published FAQs are ever passed in here (listPlatformFaqs' own RLS gate
 * already filtered them for a non-admin visitor). */
export function PlatformFaqBrowser({ faqs }: { faqs: PlatformFaq[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const presentCategories = useMemo(() => PLATFORM_FAQ_CATEGORIES.filter((c) => faqs.some((f) => f.category === c)), [faqs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faqs.filter((f) => {
      if (category !== "all" && f.category !== category) return false;
      if (!q) return true;
      return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q) || PLATFORM_FAQ_CATEGORY_LABELS[f.category].toLowerCase().includes(q);
    });
  }, [faqs, query, category]);

  function handleSearch(value: string) {
    setQuery(value);
    if (value.trim().length >= 3) track("platform_faq_search", { query: value.trim() });
  }

  function handleToggle(id: string) {
    const opening = openId !== id;
    setOpenId(opening ? id : null);
    if (opening) track("platform_faq_viewed", { faq_id: id });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <IconSearch size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text3" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search FAQs…"
          className="w-full rounded-full border border-border2 bg-bg2 py-2.5 pl-11 pr-4 text-[14px] transition focus:border-green"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategory("all")}
          className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${category === "all" ? "border-green bg-green text-green-dark" : "border-border2 text-text2 hover:border-green hover:text-green"}`}
        >
          All
        </button>
        {presentCategories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition ${category === c ? "border-green bg-green text-green-dark" : "border-border2 text-text2 hover:border-green hover:text-green"}`}
          >
            {PLATFORM_FAQ_CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-text3">No FAQs match your search.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg2">
          {filtered.map((f) => {
            const isOpen = openId === f.id;
            return (
              <div key={f.id}>
                <button type="button" onClick={() => handleToggle(f.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="min-w-0 flex-1 text-[14px] font-medium text-text">{f.question}</span>
                  <IconChevronDown size={16} className={`shrink-0 text-text3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && <p className="px-4 pb-3.5 text-[13px] leading-relaxed text-text2">{f.answer}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
