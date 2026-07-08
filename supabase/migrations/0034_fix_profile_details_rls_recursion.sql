-- Fix: infinite recursion detected in policy for relation "profile_details".
--
-- profile_details_select_staff_reviewing (0033) queried form_responses
-- directly in a raw EXISTS subquery, and form_responses'
-- select_public_event_attendance policy (also 0033) queried profile_details
-- directly the same way. Each table's RLS is subject to the other's, so
-- evaluating either policy required evaluating the other -- forever. This
-- is exactly why every other cross-table RLS check in this codebase
-- (is_community_staff, is_event_host, is_community_member, 0001_init.sql)
-- goes through a `security definer` function instead of a bare subquery: a
-- security definer function's internal queries run as the function owner,
-- bypassing RLS on the tables *it* touches entirely, which is what
-- actually breaks a cycle like this rather than just relocating it.
create function public.is_pending_applicant_reviewable_by_staff(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from form_responses fr
    where fr.owner_type = 'community'
      and fr.respondent_id = p_profile_id
      and fr.status = 'pending'
      and is_community_staff(fr.owner_id)
  );
$$;

drop policy "profile_details_select_staff_reviewing" on profile_details;
create policy "profile_details_select_staff_reviewing" on profile_details for select
  using (is_pending_applicant_reviewable_by_staff(id));

create function public.profile_visibility_allows(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profile_details pd
    where pd.id = p_profile_id
      and (pd.profile_visibility = 'public' or (pd.profile_visibility = 'members_only' and auth.uid() is not null))
  );
$$;

drop policy "form_responses_select_public_event_attendance" on form_responses;
create policy "form_responses_select_public_event_attendance" on form_responses for select
  using (
    owner_type = 'event'
    and status = 'approved'
    and exists (
      select 1 from events e where e.id = form_responses.owner_id and e.event_date < current_date
    )
    and profile_visibility_allows(respondent_id)
  );
