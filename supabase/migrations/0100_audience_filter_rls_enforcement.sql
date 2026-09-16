-- Server-side backstop for the audience filters (0098) -- the mobile app's
-- own client-side check (community/[id]/index.tsx, event/[id]/index.tsx)
-- is real UX, but a client-only check is bypassable by a modified app the
-- same way the payment-status gap (0094) was: RLS is the only boundary a
-- caller can't route around. "required" mode now genuinely blocks a
-- non-matching insert at the database, not just in the app's own UI.
--
-- "prefer not to say"/unset gender is a non-match against a gender
-- restriction, not an exception -- `is distinct from` treats null as
-- distinct from any specific value, so an unset gender fails the same way
-- an explicit non-matching gender would. Matches the resolved product
-- decision in the mobile app's own PARITY_AUDIT.md.
create function public.matches_audience(p_min_age int, p_max_age int, p_gender_restriction text, p_enforcement text, p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_gender text;
  v_dob date;
  v_age int;
begin
  if p_enforcement is distinct from 'required' then return true; end if;
  if p_min_age is null and p_max_age is null and p_gender_restriction is null then return true; end if;

  select gender, date_of_birth into v_gender, v_dob from profiles where id = p_user_id;

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

create function public.community_matches_audience(p_community_id uuid, p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  c record;
begin
  select min_age, max_age, gender_restriction, audience_enforcement into c from communities where id = p_community_id;
  if not found then return true; end if;
  return public.matches_audience(c.min_age, c.max_age, c.gender_restriction, c.audience_enforcement, p_user_id);
end;
$$;

create function public.event_matches_audience(p_event_id uuid, p_user_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  e record;
begin
  select min_age, max_age, gender_restriction, audience_enforcement into e from events where id = p_event_id;
  if not found then return true; end if;
  return public.matches_audience(e.min_age, e.max_age, e.gender_restriction, e.audience_enforcement, p_user_id);
end;
$$;

-- form_responses_insert_community (0002) -- adds the audience check on top
-- of the existing join_mode/status logic, unchanged otherwise.
drop policy "form_responses_insert_community" on form_responses;
create policy "form_responses_insert_community" on form_responses for insert to authenticated
  with check (
    owner_type = 'community'
    and respondent_id = auth.uid()
    and community_matches_audience(owner_id, auth.uid())
    and (
      (status = 'pending' and exists (select 1 from communities c where c.id = form_responses.owner_id and c.join_mode = 'request'))
      or (status = 'approved' and exists (select 1 from communities c where c.id = form_responses.owner_id and c.join_mode = 'open'))
    )
  );

-- form_responses_insert_event (0094) -- adds the audience check on top of
-- the existing payment-status guard, unchanged otherwise.
drop policy "form_responses_insert_event" on form_responses;
create policy "form_responses_insert_event" on form_responses for insert to authenticated
  with check (
    owner_type = 'event'
    and status = 'approved'
    and respondent_id = auth.uid()
    and event_matches_audience(owner_id, auth.uid())
    and (
      payment_status = 'unpaid'
      or (
        payment_status = 'paid'
        and (
          ticket_type_id is null
          or exists (
            select 1 from event_ticket_types ett
            where ett.id = form_responses.ticket_type_id and ett.price = 0
          )
        )
      )
    )
  );
