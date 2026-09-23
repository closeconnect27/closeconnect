import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getEventById, getEventTicketTypes, getEventFormFields, getEventMeetingLink, getEventDateEntries } from "@/lib/queries/events";
import { isEventPast } from "@/lib/eventStatus";
import { getCancellationPolicyForEvent } from "@/app/actions/eventCancellation";
import { getFaqsForEventEditor } from "@/app/actions/eventFaqs";
import { getAddonsForEventEditor } from "@/app/actions/eventAddons";
import { EditEventForm } from "@/components/events/EditEventForm";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  let event;
  try {
    event = await getEventById(supabase, id);
  } catch {
    notFound();
  }

  // Page-level gate in addition to the Server Action's own check (SPEC.md
  // Section 11). Admins can also edit (updateEvent allows it), but they'd
  // reach this page via a direct link, not a UI affordance shown to them --
  // out of scope to build an admin-specific edit entry point here.
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (event.host_id !== user.id && !profile?.is_admin) {
    redirect(`/events/${id}`);
  }

  // Same "already happened -> frozen" rule as the updateEvent/
  // updateEventTicketsAndForm Server Actions -- gated here too so a host
  // never even sees an editor whose Save button would just error out.
  if (isEventPast(event)) {
    redirect(`/events/${id}`);
  }

  // The meeting link is only ever shown/editable when the viewer IS the
  // host -- an admin editing someone else's event still shouldn't see it
  // pre-filled here.
  const isHost = event.host_id === user.id;

  const [ticketTypes, formFields, dateEntries, { count: registrationCount }, meetingLink, { policy: cancellationPolicy }, faqs, addons] = await Promise.all([
    getEventTicketTypes(supabase, id),
    getEventFormFields(supabase, id),
    getEventDateEntries(supabase, id),
    supabase.from("form_responses").select("*", { count: "exact", head: true }).eq("owner_type", "event").eq("owner_id", id),
    isHost ? getEventMeetingLink(supabase, id) : Promise.resolve(null),
    getCancellationPolicyForEvent(id),
    getFaqsForEventEditor(id),
    getAddonsForEventEditor(id),
  ]);

  return (
    <div className="flex-1 px-4 pb-16 pt-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        <Link
          href={`/events/${id}`}
          className="mb-4 inline-block text-[13px] text-text3 transition hover:text-text2"
        >
          ← Back to event
        </Link>
        <h1 className="mb-6 font-heading text-[18px] font-bold leading-tight">
          {event.event_date ? "Edit event" : "Finish setting up this event"}
        </h1>
        <EditEventForm
          event={event}
          ticketTypes={ticketTypes}
          formFields={formFields}
          dateEntries={dateEntries}
          hasRegistrations={(registrationCount ?? 0) > 0}
          initialMeetingLink={meetingLink}
          initialCancellationPolicy={cancellationPolicy}
          initialFaqs={faqs}
          initialAddons={addons}
        />
      </div>
    </div>
  );
}
