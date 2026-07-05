"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconSearch, IconCircleCheck, IconCircle } from "@tabler/icons-react";
import { setCheckIn } from "@/app/actions/events";
import type { EventRegistration } from "@/lib/queries/events";
import type { FormField } from "@/lib/queries/membership";

// Search + manual check-in only for v1 -- SPEC.md Section 8 explicitly warns
// against over-building this ("a mobile web page ... is enough"). A registrant
// can show their confirmation email/name at the door and staff search for
// them here; a camera-based QR scanner is a reasonable follow-up once the app
// has real check-in volume to justify it, not before.
export function EventRegistrantList({
  eventId,
  registrations,
  formFields,
}: {
  eventId: string;
  registrations: EventRegistration[];
  formFields: FormField[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registrations;
    return registrations.filter((r) => {
      const name = (r.response_data.name ?? "").toLowerCase();
      const email = (r.response_data.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [registrations, query]);

  function toggleCheckIn(r: EventRegistration) {
    setPendingId(r.id);
    startTransition(async () => {
      const result = await setCheckIn(eventId, r.id, !r.checked_in_at);
      setPendingId(null);
      if (!result.error) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <IconSearch size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text3" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full rounded-full border border-border2 bg-bg3 py-2.5 pl-11 pr-4 text-[14px] transition focus:border-green"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-text3">No registrants match.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-card border border-border bg-bg2">
          {filtered.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-text">{r.response_data.name ?? "—"}</p>
                  <p className="truncate text-[12px] text-text3">
                    {r.response_data.email}
                    {r.event_ticket_types && ` · ${r.event_ticket_types.name}`}
                  </p>
                </div>
                <button
                  onClick={() => toggleCheckIn(r)}
                  disabled={pendingId === r.id}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition disabled:opacity-50 ${
                    r.checked_in_at
                      ? "border-green bg-green-tint text-green"
                      : "border-border2 text-text2 hover:border-green hover:text-green"
                  }`}
                >
                  {r.checked_in_at ? <IconCircleCheck size={14} /> : <IconCircle size={14} />}
                  {r.checked_in_at ? "Checked in" : "Check in"}
                </button>
              </div>

              {formFields.length > 0 && (
                <div className="flex flex-col gap-1 rounded-card-sm bg-bg3 px-3 py-2">
                  {formFields.map((field) => (
                    <p key={field.id} className="text-[12px]">
                      <span className="text-text3">{field.label}: </span>
                      <span className="text-text2">{r.response_data[field.id] || "—"}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
