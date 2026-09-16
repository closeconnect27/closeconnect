-- Reintroduces a per-event list of dated entries, but as a simpler,
-- purely-informational agenda -- not the old 0073 table (dropped in 0107),
-- which coupled each date to its own registration capacity and a
-- form_responses.event_date_id FK. Product direction now: a multi-day
-- event is one registration, with a repeatable list of (date, start time,
-- end time, venue) sessions attached to it -- mirroring how
-- event_ticket_types is a simple repeatable child list with no coupling
-- back into registration logic.
--
-- events.event_date/event_end_date/event_time/event_end_time (0001-0072)
-- are kept as-is and still drive every existing list-sort/isEventPast/
-- calendar-link consumer unchanged: for a multi-day event the app sets
-- event_date = min(entry dates), event_end_date = max(entry dates),
-- event_time/event_end_time = the first/last entry's times. A single-day
-- event never gets any event_date_entries rows at all -- this table is
-- empty for the common case.
create table event_date_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  event_date date not null,
  event_time text,
  event_end_time text,
  venue text,
  sort_order int default 0
);
create index event_date_entries_event_id_idx on event_date_entries(event_id);

alter table event_date_entries enable row level security;

create policy "event_date_entries_select_public" on event_date_entries for select using (true);

create policy "event_date_entries_insert_host" on event_date_entries for insert to authenticated
  with check (is_event_host(event_id));

create policy "event_date_entries_update_host" on event_date_entries for update to authenticated
  using (is_event_host(event_id)) with check (is_event_host(event_id));

create policy "event_date_entries_delete_host" on event_date_entries for delete to authenticated
  using (is_event_host(event_id));
