-- Fixes from a pre-Play-Store-launch security audit. Four modest, real
-- issues (no criticals) -- the codebase already has two prior dedicated
-- hardening passes (0010, 0075) that this follows the same pattern of:
-- tighten a too-broad grant/policy rather than add new surface.

-- 1) host_payment_details (0066) was readable by literally anyone, signed
-- in or not -- `for select using (true)` has no `to` clause, which defaults
-- to PUBLIC (includes the unauthenticated `anon` role). The original intent
-- (comment in 0066) was "any authenticated registrant paying a host", not
-- "the entire internet, unauthenticated" -- that gap let a scraper harvest
-- every host's UPI ID platform-wide with just the public anon key.
drop policy "host_payment_details_select_public" on host_payment_details;
create policy "host_payment_details_select_authenticated" on host_payment_details for select to authenticated
  using (true);

-- 2) matches_audience/community_matches_audience/event_matches_audience
-- (0100) are security definer functions that must stay callable by
-- `authenticated` (their RLS-policy call sites run as that role), but that
-- also means any signed-in user could call them directly via RPC with an
-- ARBITRARY p_user_id -- turning them into a boolean oracle on a stranger's
-- private date_of_birth/gender. Every real call site only ever passes
-- auth.uid() as p_user_id anyway (form_responses_insert_community/_event,
-- 0100), so pinning it internally closes the oracle with no behavior change
-- for the policies that actually use these.
create or replace function public.matches_audience(p_min_age int, p_max_age int, p_gender_restriction text, p_enforcement text, p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_gender text;
  v_dob date;
  v_age int;
  v_uid uuid := auth.uid();
begin
  if p_enforcement is distinct from 'required' then return true; end if;
  if p_min_age is null and p_max_age is null and p_gender_restriction is null then return true; end if;
  if v_uid is null then return false; end if;

  select gender, date_of_birth into v_gender, v_dob from profiles where id = v_uid;

  if p_gender_restriction is not null and v_gender is distinct from p_gender_restriction then
    return false;
  end if;

  if p_min_age is not null or p_max_age is not null then
    if v_dob is null then return false; end if;
    v_age := extract(year from age(v_dob));
    if p_min_age is not null and v_age < p_min_age then return false; end if;
    if p_max_age is not null and v_age > p_max_age then return false; end if;
  end if;

  return true;
end;
$$;

create or replace function public.community_matches_audience(p_community_id uuid, p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  c record;
begin
  select min_age, max_age, gender_restriction, audience_enforcement into c from communities where id = p_community_id;
  if not found then return true; end if;
  return public.matches_audience(c.min_age, c.max_age, c.gender_restriction, c.audience_enforcement, auth.uid());
end;
$$;

create or replace function public.event_matches_audience(p_event_id uuid, p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  e record;
begin
  select min_age, max_age, gender_restriction, audience_enforcement into e from events where id = p_event_id;
  if not found then return true; end if;
  return public.matches_audience(e.min_age, e.max_age, e.gender_restriction, e.audience_enforcement, auth.uid());
end;
$$;

-- 3) reports/blocked_users had no throttle, unlike chat/join-requests/
-- registrations/ratings (0004, 0007, 0010, 0016) -- a scripted client could
-- spam a target's report queue or churn block/unblock cycles at unlimited
-- speed. Same pattern as 0004's chat rate limit.
create function public.enforce_report_rate_limit()
returns trigger language plpgsql as $$
begin
  if new.reporter_id is not null and exists (
    select 1 from reports
    where reporter_id = new.reporter_id
      and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'Reporting too quickly -- please wait a moment.';
  end if;
  return new;
end;
$$;
create trigger reports_rate_limit
  before insert on reports
  for each row execute function public.enforce_report_rate_limit();

create function public.enforce_block_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from blocked_users
    where blocker_id = new.blocker_id
      and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'Please wait a moment before blocking another user.';
  end if;
  return new;
end;
$$;
create trigger blocked_users_rate_limit
  before insert on blocked_users
  for each row execute function public.enforce_block_rate_limit();
