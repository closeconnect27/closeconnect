-- Multiple discrete session dates for one event (e.g. a workshop offered
-- on Jan 5 / Jan 12 / Jan 19 as separate sessions) -- a registrant picks
-- exactly one when registering (form_responses.event_date_id below).
-- Independent of event_date/event_end_date (0072's contiguous multi-day
-- range) -- a host can use either feature, both, or neither; this is
-- purely additive. Capacity here is its own per-date cap, alongside (not
-- instead of) the existing per-ticket-type cap on event_ticket_types --
-- both are enforced independently when both happen to be set.
create table event_dates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  event_date date not null,
  event_time text,
  event_end_time text,
  capacity int,
  sort_order int default 0
);
create index event_dates_event_id_idx on event_dates(event_id);

alter table event_dates enable row level security;

-- Same shape as event_ticket_types' own policies (0001) -- publicly
-- readable (a registrant needs to see the date options before signing
-- in), host-only write.
create policy "event_dates_select_public" on event_dates for select using (true);
create policy "event_dates_insert_host" on event_dates for insert to authenticated
  with check (is_event_host(event_id));
create policy "event_dates_update_host" on event_dates for update to authenticated
  using (is_event_host(event_id)) with check (is_event_host(event_id));
create policy "event_dates_delete_host" on event_dates for delete to authenticated
  using (is_event_host(event_id));

-- Which session date this registration is for -- null for every event
-- that doesn't use multiple session dates (the common case, and every
-- registration made before this column existed).
alter table form_responses add column event_date_id uuid references event_dates(id);

-- Per-date capacity enforcement -- same advisory-lock + sum-and-compare
-- shape as enforce_ticket_capacity() (0030/0055), keyed on event_date_id
-- instead of ticket_type_id. Runs as a second, independent trigger rather
-- than folded into enforce_ticket_capacity() itself, since a registration
-- can be constrained by ticket-type capacity, date capacity, both, or
-- neither, and this keeps each constraint's own advisory lock scoped to
-- only the resource it actually protects.
create function public.enforce_event_date_capacity()
returns trigger language plpgsql as $$
declare
  v_capacity integer;
  v_registered integer;
begin
  if new.owner_type <> 'event' or new.event_date_id is null then
    return new;
  end if;

  select capacity into v_capacity from event_dates where id = new.event_date_id;
  if v_capacity is null then
    return new; -- unlimited
  end if;

  perform pg_advisory_xact_lock(hashtext(new.event_date_id::text));

  select coalesce(sum(quantity), 0) into v_registered from form_responses
  where owner_type = 'event' and event_date_id = new.event_date_id;

  if v_registered + new.quantity > v_capacity then
    raise exception 'This date is sold out.';
  end if;

  return new;
end;
$$;

create trigger form_responses_event_date_capacity
  before insert on form_responses
  for each row
  when (new.owner_type = 'event')
  execute function public.enforce_event_date_capacity();

-- Public "X left" availability per date, same shape as
-- get_ticket_registration_counts (0006/0055) -- getEventDateAvailability
-- calls this the same way getTicketAvailability calls that one.
create function public.get_date_registration_counts(p_event_id uuid)
returns table(event_date_id uuid, registered_count bigint)
language sql stable security definer set search_path = public as $$
  select fr.event_date_id, sum(fr.quantity)
  from form_responses fr
  where fr.owner_type = 'event'
    and fr.owner_id = p_event_id
    and fr.event_date_id is not null
    and fr.status = 'approved'
  group by fr.event_date_id;
$$;
