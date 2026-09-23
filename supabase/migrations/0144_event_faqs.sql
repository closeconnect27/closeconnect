-- Per-event FAQ: a simple repeatable (question, answer) child list an
-- organizer fills in while creating or editing their event, displayed as
-- an expand/collapse accordion on the event page. Same shape/RLS
-- convention as event_date_entries (0111) and event_ticket_types --
-- a plain child table, publicly readable, host-only to write, no coupling
-- back into registration logic.
create table event_faqs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  question text not null check (char_length(question) between 1 and 300),
  answer text not null check (char_length(answer) between 1 and 2000),
  sort_order int default 0
);
create index event_faqs_event_id_idx on event_faqs(event_id);

alter table event_faqs enable row level security;

create policy "event_faqs_select_public" on event_faqs for select using (true);

create policy "event_faqs_insert_host" on event_faqs for insert to authenticated
  with check (is_event_host(event_id));

create policy "event_faqs_update_host" on event_faqs for update to authenticated
  using (is_event_host(event_id)) with check (is_event_host(event_id));

create policy "event_faqs_delete_host" on event_faqs for delete to authenticated
  using (is_event_host(event_id));
