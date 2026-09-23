import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconDownload, IconUsers, IconCircleCheck, IconHeart, IconUserX, IconChartBar, IconBan } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getEventById, getEventRegistrations, getEventTicketTypes, getEventFormFields } from "@/lib/queries/events";
import { getEventInterestCount, getVisibleInterestedUsers } from "@/lib/queries/interests";
import { getEventReminders } from "@/lib/queries/reminders";
import { getEventDmThreads, getEventDmThreadMessages } from "@/lib/queries/eventDm";
import { getDmReadTimestamps } from "@/lib/queries/dmReads";
import { EventRegistrantList } from "@/components/events/EventRegistrantList";
import { EventManageActions } from "@/components/events/EventManageActions";
import { EventFunnel } from "@/components/events/EventFunnel";
import { MessageAttendeesSection } from "@/components/events/MessageAttendeesSection";
import { EventDmInboxSection } from "@/components/events/EventDmInboxSection";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function ManageEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  // ?dmThread=<id> -- deep-link target from a "contact host" notification
  // click (notify_event_dm_message, 0074), opening straight into that
  // attendee's conversation instead of just the inbox list.
  searchParams: Promise<{ dmThread?: string }>;
}) {
  const { id } = await params;
  const { dmThread } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  let event;
  try {
    event = await getEventById(supabase, id);
  } catch {
    notFound();
  }

  if (event.host_id !== user.id) redirect(`/events/${id}`);

  const [registrations, ticketTypes, formFields, interestCount, visibleInterested, reminders, dmThreads] = await Promise.all([
    getEventRegistrations(supabase, id),
    getEventTicketTypes(supabase, id),
    getEventFormFields(supabase, id),
    getEventInterestCount(supabase, id),
    getVisibleInterestedUsers(supabase, id),
    getEventReminders(supabase, id),
    getEventDmThreads(supabase, id),
  ]);

  const dmMessagesByThread =
    dmThreads.length > 0
      ? Object.fromEntries(await Promise.all(dmThreads.map(async (t) => [t.id, await getEventDmThreadMessages(supabase, t.id)] as const)))
      : {};
  const dmReadTimestamps =
    dmThreads.length > 0 ? await getDmReadTimestamps(supabase, user.id, "event", dmThreads.map((t) => t.id)) : new Map<string, string>();

  // Counted in TICKETS (sum of quantity), not registration rows -- a group
  // booking of 4 is 4 people, not 1, for every stat below (0055). A
  // cancelled registration is excluded from every stat here (it's no
  // longer really "registered") but still appears in the full list below,
  // with its own cancelled/refund badge.
  const activeRegistrations = registrations.filter((r) => r.status !== "cancelled");
  const cancelledRegistrations = registrations.filter((r) => r.status === "cancelled");
  const totalTickets = activeRegistrations.reduce((sum, r) => sum + r.quantity, 0);
  const checkedInCount = activeRegistrations.reduce((sum, r) => sum + r.checked_in_count, 0);
  // A "no-show" is only a meaningful, final number once the event has
  // actually happened -- before then, someone who hasn't checked in yet
  // just hasn't arrived, not skipped it. No new column: derived purely from
  // event_date vs. today, same local-date comparison pattern used
  // elsewhere in this codebase (host/dashboard, profile past/upcoming).
  const eventHasPassed = event.event_date !== null && event.event_date < todayIso();
  const noShowCount = totalTickets - checkedInCount;
  const paidCount = activeRegistrations.filter((r) => r.payment_status === "paid").reduce((sum, r) => sum + r.quantity, 0);
  const refundedPaise = cancelledRegistrations.reduce((sum, r) => sum + (r.refund_amount_paise ?? 0), 0);
  const pendingRefundCount = cancelledRegistrations.filter((r) => r.refund_status === "pending" || r.refund_status === "processing").length;
  const failedRefundCount = cancelledRegistrations.filter((r) => r.refund_status === "failed").length;

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href={`/events/${id}`} className="text-[13px] text-text3 transition hover:text-text2">
              ← {event.event_name}
            </Link>
            <h1 className="mt-2 font-heading text-[18px] font-bold leading-tight">Manage registrants</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/events/${id}/analytics`} className="btn-secondary px-3 py-1.5 text-[12px]">
              <IconChartBar size={13} />
              Analytics
            </Link>
            <EventDmInboxSection
              eventId={id}
              threads={dmThreads}
              messagesByThread={dmMessagesByThread}
              currentUserId={user.id}
              readTimestamps={dmReadTimestamps}
              autoOpenThreadId={dmThread ?? null}
            />
            <EventManageActions eventId={id} status={event.status} />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
          <StatCard icon={IconHeart} label="Interested" value={interestCount} />
          <StatCard icon={IconUsers} label="Registered" value={totalTickets} />
          <StatCard icon={IconCircleCheck} label="Checked in" value={checkedInCount} />
          {eventHasPassed && <StatCard icon={IconUserX} label="No-show" value={noShowCount} />}
          {cancelledRegistrations.length > 0 && <StatCard icon={IconBan} label="Cancelled" value={cancelledRegistrations.length} />}
        </div>

        {cancelledRegistrations.length > 0 && (
          <div className="mt-4 rounded-card-sm border border-border bg-bg2 p-4 text-[13px]">
            <p className="mb-2 font-bold text-text">Cancellations &amp; refunds</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-text2">
              <span>Total refunded: ₹{(refundedPaise / 100).toLocaleString("en-IN")}</span>
              {pendingRefundCount > 0 && <span>{pendingRefundCount} refund{pendingRefundCount === 1 ? "" : "s"} in progress</span>}
              {failedRefundCount > 0 && <span className="text-pink">{failedRefundCount} refund{failedRefundCount === 1 ? "" : "s"} failed</span>}
            </div>
          </div>
        )}

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
              const count = activeRegistrations.filter((r) => r.ticket_type_id === t.id).reduce((sum, r) => sum + r.quantity, 0);
              return (
                <span key={t.id} className="rounded-full border border-border2 px-3 py-1 text-[12px] text-text2">
                  {t.name}: {count}
                  {t.quantity_available != null ? ` / ${t.quantity_available}` : ""}
                </span>
              );
            })}
          </div>
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
