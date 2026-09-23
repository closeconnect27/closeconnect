"use client";

import { useState } from "react";
import { IconTrash, IconPlus, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { EVENT_FAQ_CATEGORIES, EVENT_FAQ_CATEGORY_LABELS, EVENT_FAQ_SUGGESTIONS, type EventFaq, type EventFaqCategory } from "@/lib/eventFaqs";

/** Organizer-facing editor for an event's FAQ list -- same controlled
 * array-in/onChange-out shape as CancellationPolicyBuilder. Up to 20 rows
 * (validateFaqs' own limit), each collapsible so a host authoring several
 * questions doesn't have to scroll past every other question's full answer
 * textarea at once. */
export function FaqBuilder({ value, onChange }: { value: EventFaq[]; onChange: (value: EventFaq[]) => void }) {
  const [openIndex, setOpenIndex] = useState<number | null>(value.length === 0 ? null : 0);

  function addFaq(question = "") {
    onChange([...value, { question, answer: "", category: "general", is_published: true }]);
    setOpenIndex(value.length);
  }
  function updateFaq(i: number, patch: Partial<EventFaq>) {
    onChange(value.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function removeFaq(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
    setOpenIndex(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] text-text3">Answer the questions attendees ask most -- shown as an expandable list on the event page.</p>
      <div className="flex flex-col gap-2">
        {value.map((f, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={i} className="rounded-card-sm border border-border2 bg-bg3">
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{f.question || `Question ${i + 1}`}</span>
                {isOpen ? <IconChevronUp size={14} className="shrink-0 text-text3" /> : <IconChevronDown size={14} className="shrink-0 text-text3" />}
              </button>
              {isOpen && (
                <div className="flex flex-col gap-2 border-t border-border2 p-3">
                  <input
                    type="text"
                    value={f.question}
                    onChange={(e) => updateFaq(i, { question: e.target.value })}
                    placeholder="e.g. Is parking available?"
                    maxLength={300}
                    className="w-full rounded-card-sm border border-border2 bg-bg2 px-3 py-2 text-[13px] transition focus:border-green"
                  />
                  <textarea
                    value={f.answer}
                    onChange={(e) => updateFaq(i, { answer: e.target.value })}
                    placeholder="Answer"
                    maxLength={2000}
                    rows={3}
                    className="w-full resize-none rounded-card-sm border border-border2 bg-bg2 px-3 py-2 text-[13px] transition focus:border-green"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      value={f.category}
                      onChange={(e) => updateFaq(i, { category: e.target.value as EventFaqCategory })}
                      className="rounded-card-sm border border-border2 bg-bg2 px-2.5 py-1.5 text-[12px]"
                    >
                      {EVENT_FAQ_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {EVENT_FAQ_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-[12px] text-text2">
                      <input type="checkbox" checked={f.is_published} onChange={(e) => updateFaq(i, { is_published: e.target.checked })} />
                      Published
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFaq(i)}
                    className="flex items-center gap-1.5 self-start rounded-full border border-border2 px-3 py-1.5 text-[11px] font-medium text-text3 transition hover:border-pink hover:text-pink"
                  >
                    <IconTrash size={12} />
                    Remove
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {value.length < 20 && (
        <>
          <button
            type="button"
            onClick={() => addFaq()}
            className="flex items-center justify-center gap-2 rounded-card-sm border border-dashed border-border2 py-2.5 text-[13px] font-medium text-text2 transition hover:border-green hover:text-green"
          >
            <IconPlus size={13} />
            Add a question
          </button>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_FAQ_SUGGESTIONS.filter((s) => !value.some((f) => f.question === s)).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addFaq(s)}
                className="rounded-full border border-border2 px-2.5 py-1 text-[11px] text-text3 transition hover:border-green hover:text-green"
              >
                + {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
