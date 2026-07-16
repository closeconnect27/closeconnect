"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconSearch, IconMinus, IconPlus, IconClock } from "@tabler/icons-react";
import { setCheckInCount, confirmPayment } from "@/app/actions/events";
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

  function adjustCheckIn(r: EventRegistration, delta: number) {
    const next = r.checked_in_count + delta;
    if (next < 0 || next > r.quantity) return;
    setPendingId(r.id);
    startTransition(async () => {
      const result = await setCheckInCount(eventId, r.id, next);
      setPendingId(null);
      if (!result.error) router.refresh();
    });
  }

  function decidePayment(r: EventRegistration, decision: "confirm" | "reject") {
    setPendingId(r.id);
    startTransition(async () => {
      const result = await confirmPayment(eventId, r.id, decision);
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
                  <p className="truncate text-[14px] font-bold text-text">
                    {r.response_data.name ?? "—"}
                    {r.quantity > 1 && <span className="ml-1.5 font-normal text-text3">x{r.quantity}</span>}
                  </p>
                  <p className="truncate text-[12px] text-text3">
                    {r.response_data.email}
                    {r.event_ticket_types && ` · ${r.event_ticket_types.name}`}
                  </p>
                </div>

                {r.quantity === 1 ? (
                  <button
                    onClick={() => adjustCheckIn(r, r.checked_in_count > 0 ? -1 : 1)}
                    disabled={pendingId === r.id}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition disabled:opacity-50 ${
                      r.checked_in_count > 0
                        ? "border-green bg-green-tint text-green"
                        : "border-border2 text-text2 hover:border-green hover:text-green"
                    }`}
                  >
                    {r.checked_in_count > 0 ? "Checked in" : "Check in"}
                  </button>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => adjustCheckIn(r, -1)}
                      disabled={pendingId === r.id || r.checked_in_count === 0}
                      aria-label="Decrease checked-in count"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border2 text-text2 transition hover:border-green hover:text-green disabled:opacity-40"
                    >
                      <IconMinus size={12} />
                    </button>
                    <span
                      className={`min-w-[52px] rounded-full border px-2 py-1 text-center text-[12px] font-bold ${
                        r.checked_in_count > 0 ? "border-green bg-green-tint text-green" : "border-border2 text-text2"
                      }`}
                    >
                      {r.checked_in_count}/{r.quantity}
                    </span>
                    <button
                      onClick={() => adjustCheckIn(r, 1)}
                      disabled={pendingId === r.id || r.checked_in_count === r.quantity}
                      aria-label="Increase checked-in count"
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border2 text-text2 transition hover:border-green hover:text-green disabled:opacity-40"
                    >
                      <IconPlus size={12} />
                    </button>
                  </div>
                )}
              </div>

              {r.payment_status === "pending_verification" && (
                <div className="flex flex-col gap-2 rounded-card-sm border border-border2 bg-bg3 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[12px] font-medium text-text2">
                    <IconClock size={13} className="text-text3" />
                    Says they paid -- ref. <span className="font-mono text-text">{r.payment_reference}</span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => decidePayment(r, "confirm")}
                      disabled={pendingId === r.id}
                      className="rounded-full border border-green bg-green-tint px-3 py-1.5 text-[12px] font-bold text-green transition disabled:opacity-50"
                    >
                      Confirm paid
                    </button>
                    <button
                      onClick={() => decidePayment(r, "reject")}
                      disabled={pendingId === r.id}
                      className="rounded-full border border-border2 px-3 py-1.5 text-[12px] font-medium text-text2 transition hover:border-pink hover:text-pink disabled:opacity-50"
                    >
                      Not received
                    </button>
                  </div>
                </div>
              )}

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
