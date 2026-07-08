-- Re-scope from Branch 1's first cut: "private" now means Instagram-style
-- follow requests (owner approves a specific requester before they can see
-- the full profile), not simply "owner only, no one else, ever". And bio
-- is always public regardless of profile_visibility.
--
-- bio lives back on `profiles` (unrestricted select) -- it never actually
-- left; 0033 moved reads/writes to profile_details but deliberately left
-- the original profiles.bio column in place unused rather than dropping
-- it, so no `add column` needed here, just resuming use of it. Two
-- reasons for this split: bio needs to be readable by everyone
-- unconditionally, which only the always-open `profiles` table can do; and
-- profile_visibility itself needs to be readable by everyone too (a
-- viewer needs to know a profile is private *in order to* show a "Request
-- to follow" button at all -- same as Instagram surfacing the lock icon on
-- a private account to anyone). profile_details keeps occupation/company/
-- college/social links/skills/interests, the fields actually gated by
-- visibility.
alter table profiles add column profile_visibility text not null default 'public'
  check (profile_visibility in ('public', 'members_only', 'private'));

update profiles p set bio = pd.bio, profile_visibility = pd.profile_visibility
from profile_details pd where pd.id = p.id;

-- Must drop before dropping the columns it references.
drop policy "profile_details_select" on profile_details;
alter table profile_details drop column bio;
alter table profile_details drop column profile_visibility;

create table profile_follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references profiles(id) on delete cascade not null,
  target_id uuid references profiles(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz default now(),
  reviewed_at timestamptz,
  check (requester_id != target_id)
);
-- One pending request per requester/target pair -- a rejected request can
-- be resubmitted (the index only scopes to status = 'pending'), same
-- pattern as claims_one_pending_per_community (0024).
create unique index profile_follow_requests_one_pending on profile_follow_requests(requester_id, target_id)
  where status = 'pending';
create index profile_follow_requests_target_idx on profile_follow_requests(target_id, status);

alter table profile_follow_requests enable row level security;

create policy "pfr_select_own" on profile_follow_requests for select to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());
create policy "pfr_insert_own" on profile_follow_requests for insert to authenticated
  with check (requester_id = auth.uid());
-- Only the target decides -- a requester can never flip their own request
-- to accepted.
create policy "pfr_update_target" on profile_follow_requests for update to authenticated
  using (target_id = auth.uid()) with check (target_id = auth.uid());

-- security definer, same reasoning as is_community_staff/is_event_host
-- (0001_init.sql) and profile_visibility_allows (0034): a raw EXISTS
-- subquery against an RLS-protected table inside another table's policy
-- risks exactly the recursion bug fixed in 0034 if profile_follow_requests
-- ever needs to check profile_details/profiles in its own policies later.
create function public.has_accepted_follow_request(p_target_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profile_follow_requests
    where target_id = p_target_id and requester_id = auth.uid() and status = 'accepted'
  );
$$;

-- profiles.profile_visibility is safe to reference directly (not through a
-- security definer function) -- profiles_select_public (0001_init.sql) is
-- `using (true)`, unconditional, so there's no cycle to create.
create policy "profile_details_select" on profile_details for select
  using (
    id = auth.uid()
    or has_accepted_follow_request(id)
    or exists (
      select 1 from profiles p
      where p.id = profile_details.id
        and (p.profile_visibility = 'public' or (p.profile_visibility = 'members_only' and auth.uid() is not null))
    )
  );

-- form_responses_select_public_event_attendance (0033/0034) also needs to
-- respect the new private+accepted-follow-request case, not just
-- public/members_only.
create or replace function public.profile_visibility_allows(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_profile_id
      and (
        p.profile_visibility = 'public'
        or (p.profile_visibility = 'members_only' and auth.uid() is not null)
        or (p.profile_visibility = 'private' and has_accepted_follow_request(p.id))
      )
  );
$$;
