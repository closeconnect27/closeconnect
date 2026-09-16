-- Real gap found by audit: updateEventTicketsAndForm (src/app/actions/
-- events.ts) already enforces "ticket types and registration questions
-- can't be changed once someone has registered" -- but only at the
-- app-action layer. The mobile app's event-edit screen
-- (event/[id]/edit.tsx, formFields.ts) writes directly to
-- event_ticket_types/form_fields via the plain Supabase client with no
-- equivalent check, and RLS itself (event_ticket_types_update_host,
-- 0001_init.sql) never checked registration count either -- so a host
-- editing from the app (or anyone hitting the REST API directly with a
-- valid host session) could change a paid ticket's price, drop capacity
-- below what's already sold, or redefine registration questions after
-- people already registered and paid. This doesn't cause overselling
-- (0119's enforce_ticket_capacity is independent and still correct), but
-- it's a real fairness/data-integrity gap. Moving the freeze into RLS
-- closes it for every client, matching what the web action already
-- assumed was the only path in.
create or replace function public.event_has_registrations(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from form_responses where owner_type = 'event' and owner_id = p_event_id
  );
$$;

drop policy "event_ticket_types_update_host" on event_ticket_types;
create policy "event_ticket_types_update_host" on event_ticket_types for update to authenticated
  using (is_event_host(event_id) and not event_has_registrations(event_id))
  with check (is_event_host(event_id) and not event_has_registrations(event_id));

drop policy "event_ticket_types_delete_host" on event_ticket_types;
create policy "event_ticket_types_delete_host" on event_ticket_types for delete to authenticated
  using (is_event_host(event_id) and not event_has_registrations(event_id));

-- form_fields is polymorphic (event + community) -- only the event side
-- gets this freeze, matching the web action's own scope (community
-- join-request questions were never covered by that rule and aren't
-- changed here).
drop policy "form_fields_update_owner" on form_fields;
create policy "form_fields_update_owner" on form_fields for update to authenticated
  using (
    owns_form_target(owner_type, owner_id)
    and (owner_type <> 'event' or not event_has_registrations(owner_id))
  )
  with check (
    owns_form_target(owner_type, owner_id)
    and (owner_type <> 'event' or not event_has_registrations(owner_id))
  );

drop policy "form_fields_delete_owner" on form_fields;
create policy "form_fields_delete_owner" on form_fields for delete to authenticated
  using (
    owns_form_target(owner_type, owner_id)
    and (owner_type <> 'event' or not event_has_registrations(owner_id))
  );
