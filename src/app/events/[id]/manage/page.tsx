import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { IconDownload, IconUsers, IconCircleCheck } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getEventById, getEventRegistrations, getEventTicketTypes, getEventFormFields } from "@/lib/queries/events";
import { EventRegistrantList } from "@/components/events/EventRegistrantList";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";

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

  const [registrations, ticketTypes, formFields] = await Promise.all([
    getEventRegistrations(supabase, id),
    getEventTicketTypes(supabase, id),
    getEventFormFields(supabase, id),
  ]);

  const checkedInCount = registrations.filter((r) => r.checked_in_at).length;

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link href={`/events/${id}`} className="text-[13px] text-text3 transition hover:text-text2">
          ← {event.event_name}
        </Link>
        <h1 className="mt-2 font-heading text-[26px] font-extrabold leading-tight">Manage registrants</h1>

        <div className="mt-6 flex gap-4">
          <StatCard icon={IconUsers} label="registered" value={registrations.length} />
          <StatCard icon={IconCircleCheck} label="checked in" value={checkedInCount} />
        </div>

        {ticketTypes.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {ticketTypes.map((t) => {
              const count = registrations.filter((r) => r.ticket_type_id === t.id).length;
              return (
                <span key={t.id} className="rounded-full border border-border2 px-3 py-1 text-[12px] text-text2">
                  {t.name}: {count}
                  {t.quantity_available != null ? ` / ${t.quantity_available}` : ""}
                </span>
              );
            })}
          </div>
        )}

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
