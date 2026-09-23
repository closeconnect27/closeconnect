"use client";

import { useEffect, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";
import { track } from "@/lib/mixpanel/client";
import type { EventFaq } from "@/lib/eventFaqs";

/** Attendee-facing, expand/collapse per question -- one open at a time,
 * matching the organizer editor's own single-open-row UX
 * (FaqBuilder.tsx). */
export function FaqAccordion({ faqs, eventId }: { faqs: EventFaq[]; eventId: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    if (faqs.length > 0) track("event_faq_viewed", { event_id: eventId, faq_count: faqs.length });
    // Only ever fires once per mount (when this section actually renders
    // with at least one FAQ) -- eventId/faqs.length don't meaningfully
    // change within one page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (faqs.length === 0) return null;

  function handleToggle(i: number) {
    const opening = openIndex !== i;
    setOpenIndex(opening ? i : null);
    if (opening) track("event_faq_opened", { event_id: eventId, question: faqs[i].question });
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg2">
      {faqs.map((f, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={i}>
            <button
              type="button"
              onClick={() => handleToggle(i)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="min-w-0 flex-1 text-[14px] font-medium text-text">{f.question}</span>
              <IconChevronDown size={16} className={`shrink-0 text-text3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && <p className="px-4 pb-3.5 text-[13px] leading-relaxed text-text2">{f.answer}</p>}
          </div>
        );
      })}
    </div>
  );
}
