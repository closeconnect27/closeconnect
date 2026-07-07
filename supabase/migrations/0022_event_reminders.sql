-- Scheduled event reminders (Phase 11 Section 6). Host/admin only, all
-- operations -- separate policies per operation to match this schema's
-- existing convention rather than a single `for all` policy.
create table event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  send_at timestamptz not null,
  message text,
  sent boolean not null default false,
  created_at timestamptz default now()
);
create index event_reminders_due_idx on event_reminders(send_at) where not sent;

alter table event_reminders enable row level security;

create policy "event_reminders_select_host_or_admin" on event_reminders for select to authenticated
  using (is_event_host(event_id) or is_admin());
create policy "event_reminders_insert_host_or_admin" on event_reminders for insert to authenticated
  with check (is_event_host(event_id) or is_admin());
create policy "event_reminders_update_host_or_admin" on event_reminders for update to authenticated
  using (is_event_host(event_id) or is_admin())
  with check (is_event_host(event_id) or is_admin());
create policy "event_reminders_delete_host_or_admin" on event_reminders for delete to authenticated
  using (is_event_host(event_id) or is_admin());

-- No policy grants access to registrant emails through this table or any
-- other client-facing query -- the sending Edge Function reaches
-- form_responses/auth.users for that using the service role key
-- specifically because RLS would (correctly) refuse a normal client key.
