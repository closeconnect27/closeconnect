-- Guest event registration (SPEC.md Section 1/11) has no auth gate by
-- design, which makes it the app's most exposed insert path -- rate-limit it
-- the same way chat already is (0004_chat_rate_limit.sql): a DB-level check,
-- not just client UX, since a client-only limit is trivially bypassed by
-- calling the API directly. Guests have no user_id to key off, so this keys
-- off (event, email) instead.
create index form_responses_event_rate_limit_idx
  on form_responses(owner_id, (response_data->>'email'), created_at desc)
  where owner_type = 'event';

create function public.enforce_event_registration_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from form_responses
    where owner_type = 'event'
      and owner_id = new.owner_id
      and response_data->>'email' = new.response_data->>'email'
      and created_at > now() - interval '10 seconds'
  ) then
    raise exception 'Please wait a moment before submitting again.';
  end if;
  return new;
end;
$$;

create trigger form_responses_event_registration_rate_limit
  before insert on form_responses
  for each row
  when (new.owner_type = 'event')
  execute function public.enforce_event_registration_rate_limit();
