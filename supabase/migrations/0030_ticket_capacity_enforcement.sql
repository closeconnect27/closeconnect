-- Ticket-type capacity was stored (event_ticket_types.quantity_available)
-- and displayed (getTicketAvailability's RPC, disabling the client's
-- button when sold out) but never actually enforced -- a direct call to
-- registerForEvent bypassing the disabled button could still register for
-- a "sold out" ticket type with no server-side check at all. Enforced here
-- as a DB-level trigger, same pattern as the rate-limit triggers elsewhere
-- in this app, so it can't be bypassed by any caller.
create function public.enforce_ticket_capacity()
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

  -- Transaction-scoped advisory lock keyed to this ticket type -- without
  -- it, two concurrent registrations for the last spot could both count
  -- the same "9 of 10 taken" snapshot before either commits and both pass.
  -- hashtext() collapses the uuid to a lockable bigint; released
  -- automatically at transaction end, no explicit unlock needed.
  perform pg_advisory_xact_lock(hashtext(new.ticket_type_id::text));

  select count(*) into v_registered from form_responses
  where owner_type = 'event' and ticket_type_id = new.ticket_type_id;

  if v_registered >= v_capacity then
    raise exception 'This ticket type is sold out.';
  end if;

  return new;
end;
$$;

create trigger form_responses_ticket_capacity
  before insert on form_responses
  for each row
  when (new.owner_type = 'event')
  execute function public.enforce_ticket_capacity();
