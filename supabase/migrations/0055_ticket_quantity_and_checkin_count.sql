-- Buying multiple tickets in one registration (e.g. one person registering
-- for a group of friends), instead of requiring a separate account per
-- ticket. quantity=1 is the default so every existing row (and every
-- caller that doesn't pass it) keeps its current one-ticket meaning
-- exactly. Capped at 10 -- generous for a small-group booking, small
-- enough that a single row can't silently exhaust a whole ticket type's
-- capacity by itself.
alter table form_responses add column quantity int not null default 1;
alter table form_responses add constraint form_responses_quantity_range check (quantity between 1 and 10);

-- Partial check-in: how many of THIS registration's `quantity` people have
-- actually arrived, not just whether the registration itself has been
-- touched. checked_in_at (0001) is kept as-is and still means "checked in
-- at all" (set the moment checked_in_count first goes above 0) -- every
-- existing reader of checked_in_at (feedback eligibility, no-show/funnel
-- stats) keeps working unchanged; checked_in_count is additive, not a
-- replacement.
alter table form_responses add column checked_in_count int not null default 0;
alter table form_responses add constraint form_responses_checked_in_count_range check (checked_in_count >= 0 and checked_in_count <= quantity);

-- Capacity is now consumed by ticket COUNT, not registration-row count --
-- a single row buying 4 tickets must be checked (and locked) against the
-- remaining capacity exactly like 4 separate registrations would be.
create or replace function public.enforce_ticket_capacity()
returns trigger language plpgsql as $$
declare
  v_capacity integer;
  v_registered integer;
begin
  if new.owner_type <> 'event' or new.ticket_type_id is null then
    return new;
  end if;

  select quantity_available into v_capacity from event_ticket_types where id = new.ticket_type_id;
  if v_capacity is null then
    return new; -- unlimited
  end if;

  perform pg_advisory_xact_lock(hashtext(new.ticket_type_id::text));

  select coalesce(sum(quantity), 0) into v_registered from form_responses
  where owner_type = 'event' and ticket_type_id = new.ticket_type_id;

  if v_registered + new.quantity > v_capacity then
    raise exception 'This ticket type is sold out.';
  end if;

  return new;
end;
$$;

-- Same ticket-count-not-row-count fix for the public availability RPC
-- (0006) -- getTicketAvailability shows "X left", which must reflect
-- tickets taken, not registrations taken.
create or replace function public.get_ticket_registration_counts(p_event_id uuid)
returns table(ticket_type_id uuid, registered_count bigint)
language sql stable security definer set search_path = public as $$
  select ticket_type_id, sum(quantity)
  from form_responses
  where owner_type = 'event'
    and owner_id = p_event_id
    and ticket_type_id is not null
    and status = 'approved'
  group by ticket_type_id;
$$;
