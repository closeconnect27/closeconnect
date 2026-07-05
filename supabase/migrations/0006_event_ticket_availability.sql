-- Public ticket-availability counts (Section 8's "quantity cap" +
-- Meetup-style "8 seats left" signal researched for the Phase 7 redesign).
-- form_responses itself is correctly locked down to the event host and the
-- respondent (Section 5's RLS table -- it's PII, never public), so a plain
-- visitor can't count registrations directly. This function returns only an
-- aggregate count per ticket type, never response_data/respondent identity,
-- so it's safe to expose publicly without weakening that policy.
create function public.get_ticket_registration_counts(p_event_id uuid)
returns table(ticket_type_id uuid, registered_count bigint)
language sql stable security definer set search_path = public as $$
  select ticket_type_id, count(*)
  from form_responses
  where owner_type = 'event'
    and owner_id = p_event_id
    and ticket_type_id is not null
    and status = 'approved'
  group by ticket_type_id;
$$;

grant execute on function public.get_ticket_registration_counts(uuid) to anon, authenticated;
