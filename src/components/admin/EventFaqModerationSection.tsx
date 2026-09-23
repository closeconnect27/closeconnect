"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setEventFaqHiddenByAdmin, type EventFaqModerationRow } from "@/app/actions/eventFaqs";

/** Admin moderation (section 43) -- view every organizer's event FAQs and
 * hide inappropriate ones without editing the organizer's own text. */
export function EventFaqModerationSection({ faqs }: { faqs: EventFaqModerationRow[] }) {
  if (faqs.length === 0) {
    return <p className="mt-8 text-center text-[13px] text-text3">No event FAQs yet.</p>;
  }

  return (
    <div className="mt-6 flex flex-col divide-y divide-border rounded-card border border-border bg-bg2">
      {faqs.map((f) => (
        <Row key={f.id} faq={f} />
      ))}
    </div>
  );
}

function Row({ faq }: { faq: EventFaqModerationRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      await setEventFaqHiddenByAdmin(faq.id, !faq.isHiddenByAdmin);
      router.refresh();
    });
  }

  return (
    <div className={`flex items-start justify-between gap-3 px-4 py-3 ${faq.isHiddenByAdmin ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <Link href={`/events/${faq.eventId}`} className="text-[12px] text-text3 hover:text-green">
          {faq.eventName}
        </Link>
        <p className="text-[13px] font-bold text-text">{faq.question}</p>
        <p className="mt-0.5 line-clamp-2 text-[12px] text-text3">{faq.answer}</p>
        {!faq.is_published && <span className="mt-1 inline-block text-[11px] text-text3">Unpublished by organizer</span>}
      </div>
      <button onClick={handleToggle} disabled={pending} className="btn-secondary shrink-0 px-3 py-1.5 text-[12px]">
        {faq.isHiddenByAdmin ? "Unhide" : "Hide"}
      </button>
    </div>
  );
}
