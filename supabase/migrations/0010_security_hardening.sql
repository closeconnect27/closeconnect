-- CRITICAL, found via actually attempting cross-user access rather than a
-- policy-exists check (SPEC.md Section 11's own first bullet): the open-join
-- insert policy checked user_id = auth.uid() and that the community is
-- open, but placed no constraint on the `role` column at all. Any
-- authenticated caller could bypass joinOpenCommunity entirely and insert
-- themselves directly as role='owner' on ANY open community via a raw API
-- call, instantly gaining full staff control (approve/reject requests,
-- manage groups, moderate/remove members) over a community they never
-- created. Confirmed exploitable against a real community before patching.
-- The trigger-based approval path (approve_join_request, security definer)
-- was never affected -- it hardcodes the insert with no role column,
-- defaulting to 'member', and isn't reachable by arbitrary client input.
drop policy "community_members_insert_self_open" on community_members;
create policy "community_members_insert_self_open" on community_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'member'
    and exists (select 1 from communities c where c.id = community_id and c.join_mode = 'open')
  );

-- CRITICAL, same class of bug, platform-wide instead of per-community: the
-- self-update policy on profiles checked id = auth.uid() but placed no
-- constraint on is_admin. Any authenticated user could call
-- `.from('profiles').update({ is_admin: true })` on their own row and it
-- would pass RLS outright -- instant, unlimited platform admin (every
-- is_admin() check across communities/reports/RLS grants access). Confirmed
-- exploitable against a real test account before patching; checked the live
-- table for is_admin=true rows afterward and found none, so this wasn't
-- previously exploited, but it was live. Uses an old-value subquery (rather
-- than hardcoding false) so it also holds if an admin is ever provisioned
-- directly via service role later -- they still can't touch their own flag
-- through this policy, in either direction.
drop policy "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and is_admin = (select p.is_admin from profiles p where p.id = auth.uid()));

drop policy "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles for insert to authenticated
  with check (id = auth.uid() and is_admin = false);

-- Latent, not currently reachable (nothing in the app grants a 'moderator'
-- role today -- only the creator ever gets 'owner', via the
-- on_community_created trigger) but a real gap in the policy itself: staff
-- update access was gated by is_community_staff(id), which is true for
-- moderators too, and the WITH CHECK placed no constraint on owner_id. Once
-- moderators exist, any moderator could rewrite owner_id to themselves and
-- take over the community outright. Admins can still reassign owner_id
-- (e.g. a future claim-transfer flow); owners/moderators can update
-- everything else about their own community, just not who owns it.
drop policy "communities_update_owner_or_admin" on communities;
create policy "communities_update_owner_or_admin" on communities for update to authenticated
  using (owner_id = auth.uid() or is_community_staff(id) or is_admin())
  with check (
    is_admin()
    or (
      (owner_id = auth.uid() or is_community_staff(id))
      and owner_id = (select c.owner_id from communities c where c.id = communities.id)
    )
  );

-- Same latent class, also currently unreachable (confirmed: nothing in the
-- app ever grants role='moderator' -- every reference to it in src/ is
-- read-only permission-checking, never a write. The only way a moderator
-- row could ever have been created was the now-patched insert-self-open
-- bug above). Still, is_community_staff() is true for moderators, and
-- neither policy distinguished "staff" from "the specific owner" for
-- role-integrity-sensitive operations:
--  - update: any staff member could set ANY member's role to 'owner'
--    (self-promotion past the person who's supposed to outrank them), or
--    demote the real owner to 'member'.
--  - delete: any staff member could remove the real owner's own membership
--    row outright, cascading out their group memberships too.
-- Restricted both to require being the actual owner (or admin) rather than
-- "any staff" -- moderators can still be looked up/displayed, just not
-- role-edited or have the owner removed by a fellow moderator.
drop policy "community_members_update_staff" on community_members;
create policy "community_members_update_staff" on community_members for update to authenticated
  using (is_community_staff(community_id))
  with check (
    is_admin()
    or exists (
      select 1 from community_members cm
      where cm.community_id = community_members.community_id and cm.user_id = auth.uid() and cm.role = 'owner'
    )
  );

drop policy "community_members_delete_self_or_staff" on community_members;
create policy "community_members_delete_self_or_staff" on community_members for delete to authenticated
  using (
    user_id = auth.uid()
    or is_admin()
    or (
      is_community_staff(community_id)
      and role <> 'owner'
    )
  );

-- Phase 10 security/vulnerability checklist (SPEC.md Section 11) closes
-- three more gaps found during the audit rather than deferring them:
--
-- 1. Rate limiting was only ever built for chat messages (0004) and event
--    registration (0007). The checklist explicitly also calls out
--    community/event creation and ratings -- none of those had any limit
--    at the DB level, so a client bypassing the UI entirely could spam all
--    three. Same trigger shape as the existing ones for consistency.
--
-- 2. submitJoinRequest (community join-requests) had no protection against
--    a direct action call (bypassing the UI, which only ever shows the
--    request form once) submitting many duplicate 'pending' rows for the
--    same community -- cluttering a host's approval queue even at
--    human-typing speed, not just bot speed. A partial unique index scoped
--    to status = 'pending' fixes this without touching 'approved'/
--    'rejected' rows or open-join's own (harmless, on-conflict-deduped)
--    form_responses rows, and without blocking a legitimate
--    leave-then-rejoin-later flow.
--
-- 3. reports.reason had no constraint at all -- the UI only ever sends one
--    of 4 fixed values, but nothing stopped a direct API call (using the
--    caller's own valid JWT) from writing an arbitrary string. Low
--    real-world impact (reports are admin-only reading, not rendered
--    publicly) but a real gap in "validate server-side, don't trust the
--    client" nonetheless.

create index communities_creation_rate_limit_idx on communities(owner_id, created_at desc);
create function public.enforce_community_creation_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from communities
    where owner_id = new.owner_id and created_at > now() - interval '30 seconds'
  ) then
    raise exception 'Creating communities too quickly -- please wait a moment.';
  end if;
  return new;
end;
$$;
create trigger communities_creation_rate_limit
  before insert on communities
  for each row execute function public.enforce_community_creation_rate_limit();

create index events_creation_rate_limit_idx on events(host_id, created_at desc);
create function public.enforce_event_creation_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from events
    where host_id = new.host_id and created_at > now() - interval '30 seconds'
  ) then
    raise exception 'Creating events too quickly -- please wait a moment.';
  end if;
  return new;
end;
$$;
create trigger events_creation_rate_limit
  before insert on events
  for each row execute function public.enforce_event_creation_rate_limit();

create index community_ratings_rate_limit_idx on community_ratings(user_id, created_at desc);
create function public.enforce_rating_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from community_ratings
    where user_id = new.user_id and created_at > now() - interval '3 seconds'
  ) then
    raise exception 'Rating too quickly -- please wait a moment.';
  end if;
  return new;
end;
$$;
create trigger community_ratings_rate_limit
  before insert on community_ratings
  for each row execute function public.enforce_rating_rate_limit();

create index form_responses_join_request_rate_limit_idx
  on form_responses(respondent_id, created_at desc)
  where owner_type = 'community';
create function public.enforce_join_request_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from form_responses
    where owner_type = 'community'
      and respondent_id = new.respondent_id
      and created_at > now() - interval '5 seconds'
  ) then
    raise exception 'Submitting requests too quickly -- please wait a moment.';
  end if;
  return new;
end;
$$;
create trigger form_responses_join_request_rate_limit
  before insert on form_responses
  for each row
  when (new.owner_type = 'community')
  execute function public.enforce_join_request_rate_limit();

create unique index form_responses_one_pending_per_respondent
  on form_responses(owner_type, owner_id, respondent_id)
  where status = 'pending';

alter table reports add constraint reports_reason_check
  check (reason in ('dead_link', 'spam', 'inappropriate', 'duplicate'));
