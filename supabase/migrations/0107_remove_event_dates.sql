-- Removes the "multiple selectable session dates" feature (0073) entirely.
-- Product decision: an event that recurs on several different days is now
-- meant to be several separate single-day events, not one event with
-- several pickable dates -- a host who wants that creates multiple events
-- instead. Zero rows exist in event_dates in production as of this
-- migration (confirmed directly before writing it), so this is a clean
-- removal, not a data migration.
drop trigger if exists form_responses_event_date_capacity on form_responses;
drop function if exists public.enforce_event_date_capacity();
drop function if exists public.get_date_registration_counts(uuid);
alter table form_responses drop column if exists event_date_id;
drop table if exists event_dates;
