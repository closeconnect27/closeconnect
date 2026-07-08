-- Redefine "members_only" (0035): was "any signed-in user on the site can
-- see it", now "only someone who shares at least one community with the
-- profile owner can see it" -- e.g. a community owner sets their profile
-- to members_only and only *that community's* members (not the whole
-- site) can see it. Applies the same way to a regular member, not just an
-- owner: shared membership in any community either party belongs to.
--
-- security definer, same reasoning as has_accepted_follow_request (0035):
-- community_members_select_public (0001_init.sql) is actually
-- unconditional already, so this specific query wouldn't recurse even as a
-- bare subquery, but every other cross-table RLS check in this codebase
-- goes through a security definer function on principle -- consistent, and
-- insurance against community_members' own policy ever becoming
-- conditional later.
create function public.shares_community_with(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from community_members cm1
    join community_members cm2 on cm1.community_id = cm2.community_id
    where cm1.user_id = auth.uid() and cm2.user_id = p_profile_id
  );
$$;

drop policy "profile_details_select" on profile_details;
create policy "profile_details_select" on profile_details for select
  using (
    id = auth.uid()
    or has_accepted_follow_request(id)
    or exists (
      select 1 from profiles p
      where p.id = profile_details.id
        and (p.profile_visibility = 'public' or (p.profile_visibility = 'members_only' and shares_community_with(p.id)))
    )
  );

create or replace function public.profile_visibility_allows(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_profile_id
      and (
        p.profile_visibility = 'public'
        or (p.profile_visibility = 'members_only' and shares_community_with(p.id))
        or (p.profile_visibility = 'private' and has_accepted_follow_request(p.id))
      )
  );
$$;
