-- The host currently gets NO signal at all when someone registers for
-- their event -- every existing "You're registered!" notification (web's
-- registerForEvent, the Razorpay webhook, the mobile verify route) is
-- correctly addressed to the REGISTRANT, not the host; there was simply no
-- host-facing notification of any kind. Mirrors notify_new_join_request's
-- shape (0061) for the community-join equivalent of this same gap.
--
-- Fires on the free-ticket path immediately (status='approved' at insert
-- time already) and again once a paid registration actually clears
-- (payment_status flips to 'paid') -- a hosted event shouldn't be told
-- about a registration that might still fail payment. Guards against the
-- host's own row just in case (mobile/web both already block a host from
-- registering for their own event in the UI, but this is the same
-- defense-in-depth posture as everywhere else in this schema).
create function public.notify_host_of_new_registration()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_host_id uuid;
  v_event_name text;
  v_is_paid boolean;
  v_registrant_name text;
begin
  if new.owner_type <> 'event' or new.status <> 'approved' then
    return new;
  end if;

  select host_id, event_name into v_host_id, v_event_name from events where id = new.owner_id;
  if v_host_id is null or v_host_id = new.respondent_id then
    return new;
  end if;

  if new.ticket_type_id is not null then
    select price > 0 into v_is_paid from event_ticket_types where id = new.ticket_type_id;
  else
    v_is_paid := false;
  end if;

  -- A paid ticket only counts as a real registration once payment clears.
  -- Branched explicitly on TG_OP (rather than folded into one OR
  -- expression) since `old` isn't available at all on the INSERT path --
  -- this keeps that fact structurally obvious instead of relying on
  -- short-circuit evaluation order to avoid referencing it.
  if v_is_paid then
    if TG_OP = 'INSERT' then
      return new; -- wait for the payment to actually clear
    elsif new.payment_status <> 'paid' or old.payment_status = 'paid' then
      return new; -- not a fresh unpaid -> paid transition
    end if;
  end if;

  v_registrant_name := coalesce(new.response_data->>'name', 'Someone');

  insert into notifications (user_id, type, title, body, link)
  values (
    v_host_id,
    'event_new_registration',
    'New registration',
    v_registrant_name || ' registered for ' || v_event_name || case when new.quantity > 1 then ' (' || new.quantity || ' tickets)' else '' end,
    '/events/' || new.owner_id || '/manage'
  );

  return new;
end;
$$;

create trigger form_responses_notify_host_insert
  after insert on form_responses
  for each row
  when (new.owner_type = 'event')
  execute function public.notify_host_of_new_registration();

create trigger form_responses_notify_host_update
  after update on form_responses
  for each row
  when (new.owner_type = 'event' and new.payment_status is distinct from old.payment_status)
  execute function public.notify_host_of_new_registration();
