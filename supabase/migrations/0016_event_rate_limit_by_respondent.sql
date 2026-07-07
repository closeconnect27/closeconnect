-- 0007's rate-limit trigger keyed off response_data->>'email' because guest
-- registration had no respondent_id to key off. Now that 0015 requires an
-- account for every registration, respondent_id is the real, unspoofable
-- identity -- simpler and more robust than re-parsing the JSON email on
-- every check.
drop trigger "form_responses_event_registration_rate_limit" on form_responses;
drop function public.enforce_event_registration_rate_limit();
drop index if exists form_responses_event_rate_limit_idx;

create index form_responses_event_rate_limit_idx
  on form_responses(owner_id, respondent_id, created_at desc)
  where owner_type = 'event';

create function public.enforce_event_registration_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from form_responses
    where owner_type = 'event'
      and owner_id = new.owner_id
      and respondent_id = new.respondent_id
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
