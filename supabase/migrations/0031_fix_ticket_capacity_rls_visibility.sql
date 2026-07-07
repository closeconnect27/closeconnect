-- Real bug found while testing 0030: enforce_ticket_capacity() had no
-- `security definer`, so its internal `select count(*) from form_responses`
-- ran under the CALLING user's own row-visibility RLS
-- (form_responses_select_owner_or_respondent: only rows you own or
-- responded to). A registrant who isn't the event's host couldn't see
-- other people's registration rows at all, so the trigger's count came
-- back artificially low (or zero) and let a "sold out" ticket type keep
-- accepting registrations for anyone but the host. Needs security definer
-- to count every registration regardless of who's inserting -- same
-- reasoning already applied to on_community_created()/
-- approve_join_request() elsewhere in this app.
create or replace function public.enforce_ticket_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
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

  select count(*) into v_registered from form_responses
  where owner_type = 'event' and ticket_type_id = new.ticket_type_id;

  if v_registered >= v_capacity then
    raise exception 'This ticket type is sold out.';
  end if;

  return new;
end;
$$;
