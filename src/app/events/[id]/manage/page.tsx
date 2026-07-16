import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconDownload, IconUsers, IconCircleCheck, IconHeart, IconUserX } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getEventById, getEventRegistrations, getEventTicketTypes, getEventFormFields } from "@/lib/queries/events";
import { getEventInterestCount, getVisibleInterestedUsers } from "@/lib/queries/interests";
import { getEventReminders } from "@/lib/queries/reminders";
import { EventRegistrantList } from "@/components/events/EventRegistrantList";
import { EventManageActions } from "@/components/events/EventManageActions";
import { EventFunnel } from "@/components/events/EventFunnel";
import { PayoutSummary } from "@/components/events/PayoutSummary";
import { MessageAttendeesSection } from "@/components/events/MessageAttendeesSection";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ManageEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  let event;
  try {
    event = await getEventById(supabase, id);
  } catch {
    notFound();
  }

  if (event.host_id !== user.id) redirect(`/events/${id}`);

  const [registrations, ticketTypes, formFields, interestCount, visibleInterested, reminders] = await Promise.all([
    getEventRegistrations(supabase, id),
    getEventTicketTypes(supabase, id),
    getEventFormFields(supabase, id),
    getEventInterestCount(supabase, id),
    getVisibleInterestedUsers(supabase, id),
    getEventReminders(supabase, id),
  ]);

  // Counted in TICKETS (sum of quantity), not registration rows -- a group
  // booking of 4 is 4 people, not 1, for every stat below (0055).
  const totalTickets = registrations.reduce((sum, r) => sum + r.quantity, 0);
  const checkedInCount = registrations.reduce((sum, r) => sum + r.checked_in_count, 0);
  // A "no-show" is only a meaningful, final number once the event has
  // actually happened -- before then, someone who hasn't checked in yet
  // just hasn't arrived, not skipped it. No new column: derived purely from
  // event_date vs. today, same local-date comparison pattern used
  // elsewhere in this codebase (host/dashboard, profile past/upcoming).
  const eventHasPassed = event.event_date !== null && event.event_date < todayIso();
  const noShowCount = totalTickets - checkedInCount;
  const paidCount = registrations.filter((r) => r.payment_status === "paid").reduce((sum, r) => sum + r.quantity, 0);

  // Only a $0 ticket type never actually moved any money -- payment_status
  // is set to 'paid' for those too (0041, for the funnel's sake), but
  // nothing was ever collected, so it can't be "owed".
  const priceByTicketTypeId = new Map(ticketTypes.map((t) => [t.id, t.price]));
  let payoutOwed = 0;
  let payoutPaidOut = 0;
  for (const r of registrations) {
    if (r.payment_status !== "paid" || !r.ticket_type_id) continue;
    const price = priceByTicketTypeId.get(r.ticket_type_id) ?? 0;
    if (price <= 0) continue;
    if (r.payout_status === "pending") payoutOwed += price * r.quantity;
    else payoutPaidOut += price * r.quantity;
  }

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href={`/events/${id}`} className="text-[13px] text-text3 transition hover:text-text2">
              ← {event.event_name}
            </Link>
            <h1 className="mt-2 font-heading text-[18px] font-bold leading-tight">Manage registrants</h1>
          </div>
          <EventManageActions eventId={id} status={event.status} />
        </div>

        <div className="mt-6 flex gap-4">
          <StatCard icon={IconHeart} label="Interested" value={interestCount} />
          <StatCard icon={IconUsers} label="Registered" value={totalTickets} />
          <StatCard icon={IconCircleCheck} label="Checked in" value={checkedInCount} />
          {eventHasPassed && <StatCard icon={IconUserX} label="No-show" value={noShowCount} />}
        </div>

        <div className="mt-4">
          <EventFunnel
            interestCount={interestCount}
            registeredCount={totalTickets}
            paidCount={paidCount}
            checkedInCount={checkedInCount}
            noShowCount={noShowCount}
            eventHasPassed={eventHasPassed}
          />
        </div>

        {visibleInterested.length > 0 && (
          <div className="mt-4">
            <span className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-wide text-text3">
              Interested (shared their name)
            </span>
            <div className="flex flex-wrap gap-2">
              {visibleInterested.map((u) => (
                <Link
                  key={u.userId}
                  href={`/profile/${u.userId}`}
                  className="rounded-full border border-border2 px-3 py-1.5 text-[12px] text-text2 transition hover:border-green hover:text-green"
                >
                  {u.displayName}
                </Link>
              ))}
            </div>
          </div>
        )}

        {ticketTypes.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {ticketTypes.map((t) => {
              const count = registrations.filter((r) => r.ticket_type_id === t.id).reduce((sum, r) => sum + r.quantity, 0);
              return (
                <span key={t.id} className="rounded-full border border-border2 px-3 py-1 text-[12px] text-text2">
                  {t.name}: {count}
                  {t.quantity_available != null ? ` / ${t.quantity_available}` : ""}
                </span>
              );
            })}
          </div>
        )}

        {(payoutOwed > 0 || payoutPaidOut > 0) && (
          <PayoutSummary eventId={id} owedAmount={payoutOwed} paidOutAmount={payoutPaidOut} />
        )}

        <MessageAttendeesSection eventId={id} reminders={reminders} />

        <div className="mt-6 flex justify-end">
          <a href={`/events/${id}/manage/export`} className="btn-secondary px-4 py-2 text-[13px]">
            <IconDownload size={14} />
            Export CSV
          </a>
        </div>

        <div className="mt-4">
          {registrations.length === 0 ? (
            <EmptyState icon={IconUsers} title="No registrants yet" description="Share the event link to get your first sign-up." />
          ) : (
            <EventRegistrantList eventId={id} registrations={registrations} formFields={formFields} />
          )}
        </div>
      </div>
    </div>
  );
}
