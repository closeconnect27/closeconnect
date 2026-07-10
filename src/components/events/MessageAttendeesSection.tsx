"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconSend, IconClock, IconCircleCheck } from "@tabler/icons-react";
import { createEventReminder } from "@/app/actions/reminders";
import { DatePicker } from "@/components/ui/DatePicker";
import type { EventReminder } from "@/lib/queries/reminders";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// One mechanism, two use cases: message everyone right now ("running 15
// minutes late") or schedule a reminder for later (a day-before nudge).
// Both just create an event_reminders row -- see createEventReminder.
export function MessageAttendeesSection({ eventId, reminders }: { eventId: string; reminders: EventReminder[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSent(false);

    let sendAt: string | undefined;
    if (mode === "schedule") {
      if (!date) {
        setError("Choose a date to schedule for");
        return;
      }
      const local = new Date(`${date}T${time || "09:00"}`);
      if (Number.isNaN(local.getTime()) || local.getTime() < Date.now()) {
        setError("Choose a time in the future");
        return;
      }
      sendAt = local.toISOString();
    }

    startTransition(async () => {
      const result = await createEventReminder(eventId, { message, send_at: sendAt });
      if (result?.error) setError(result.error);
      else {
        setMessage("");
        setSent(true);
        router.refresh();
      }
    });
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-wide text-text3">Message attendees</h2>
      <form onSubmit={handleSubmit} className="card-elevated flex flex-col gap-3 rounded-card bg-bg2 p-4">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. Running 15 minutes late -- see you soon!"
          rows={3}
          maxLength={500}
          required
          className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("now")}
            className={`flex-1 rounded-full border px-3 py-2 text-[12px] font-medium transition ${
              mode === "now" ? "border-green bg-green-tint text-green" : "border-border2 text-text2 hover:border-green"
            }`}
          >
            Send now
          </button>
          <button
            type="button"
            onClick={() => setMode("schedule")}
            className={`flex-1 rounded-full border px-3 py-2 text-[12px] font-medium transition ${
              mode === "schedule" ? "border-green bg-green-tint text-green" : "border-border2 text-text2 hover:border-green"
            }`}
          >
            Schedule for later
          </button>
        </div>

        {mode === "schedule" && (
          <div className="grid grid-cols-2 gap-3">
            <DatePicker value={date || null} onChange={setDate} minDate={todayIso()} placeholder="Date" />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-card-sm border border-border2 bg-bg3 px-4 py-3 text-[14px] transition focus:border-green"
            />
          </div>
        )}

        {error && <p className="text-[13px] text-pink">{error}</p>}
        {sent && (
          <p className="flex items-center gap-1.5 text-[13px] text-green">
            <IconCircleCheck size={14} />
            {mode === "now" ? "Sending -- goes out within a few minutes." : "Scheduled."}
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary py-2.5 text-[13px]">
          <IconSend size={14} />
          {pending ? "Saving…" : mode === "now" ? "Send to all registrants" : "Schedule"}
        </button>
      </form>

      {reminders.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {reminders.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-card-sm border border-border2 bg-bg2 px-3 py-2 text-[12px]">
              {r.sent ? (
                <IconCircleCheck size={13} className="shrink-0 text-green" />
              ) : (
                <IconClock size={13} className="shrink-0 text-text3" />
              )}
              <span className="min-w-0 flex-1 truncate text-text2">{r.message}</span>
              <span className="shrink-0 text-text3">
                {r.sent ? "Sent" : "Due"} {new Date(r.send_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
