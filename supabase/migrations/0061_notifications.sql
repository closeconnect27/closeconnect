-- In-app notifications: a bell icon + list, covering every "something
-- happened that this user would want to know about" moment already in the
-- app (claim approved, auto-verified, founding marked, host messages,
-- registration confirmations, join request outcomes) plus the new instant
-- "+Follow" relationship below (new follower, follow request accepted,
-- a followed user creating a community or hosting an event).
--
-- All cross-user inserts (recipient != the acting user) go through
-- security definer trigger functions, same convention as every other
-- cross-table side effect in this schema (review_community_claim,
-- approve_join_request, etc.) -- RLS only needs to allow a user to
-- read/mark-read their OWN notifications, plus insert their own
-- self-notification (event registered, where recipient = actor).
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null check (type in (
    'claim_approved',
    'organizer_verified',
    'founding_marked',
    'event_message',
    'event_registered',
    'join_request_approved',
    'join_request_rejected',
    'join_request_pending',
    'new_follower',
    'follow_request_accepted',
    'followed_new_community',
    'followed_new_event'
  )),
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz default now()
);
create index notifications_user_created_idx on notifications(user_id, created_at desc);
create index notifications_user_unread_idx on notifications(user_id) where read_at is null;

alter table notifications enable row level security;
create policy "notifications_select_own" on notifications for select to authenticated
  using (user_id = auth.uid());
create policy "notifications_update_own" on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Only a self-notification (event registered) is ever inserted directly by
-- app code under the requester's own RLS-scoped client -- every other
-- notification type is inserted by a security definer trigger function,
-- which bypasses RLS entirely and needs no policy of its own.
create policy "notifications_insert_self" on notifications for insert to authenticated
  with check (user_id = auth.uid());

-- profile_follows: instant, no-approval follow relationship for
-- public/members_only profiles -- distinct from profile_follow_requests
-- (0035), which stays exactly as-is for private profiles. "Am I following
-- X" for notification fan-out purposes below means either table.
create table profile_follows (
  follower_id uuid references profiles(id) on delete cascade not null,
  followee_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (follower_id, followee_id),
  check (follower_id != followee_id)
);
create index profile_follows_followee_idx on profile_follows(followee_id);

alter table profile_follows enable row level security;
create policy "profile_follows_select_own" on profile_follows for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());
-- Mirrors profile_visibility_allows (0036) minus the private branch --
-- private profiles keep requiring an approved request (profile_follow_requests),
-- never an instant follow.
create policy "profile_follows_insert_own" on profile_follows for insert to authenticated
  with check (
    follower_id = auth.uid()
    and exists (
      select 1 from profiles p
      where p.id = followee_id
      and (p.profile_visibility = 'public' or (p.profile_visibility = 'members_only' and shares_community_with(p.id)))
    )
  );
create policy "profile_follows_delete_own" on profile_follows for delete to authenticated
  using (follower_id = auth.uid());

-- =========================================================================
-- Claim approved
-- =========================================================================
create or replace function public.review_community_claim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = old.status then
    return new;
  end if;

  new.reviewed_at = now();

  if new.status = 'approved' then
    update communities set owner_id = new.claimant_user_id, claim_status = 'approved' where id = new.community_id;

    insert into community_members (community_id, user_id, role)
    values (new.community_id, new.claimant_user_id, 'owner')
    on conflict (community_id, user_id) do nothing;

    insert into community_group_members (group_id, user_id)
    select cg.id, new.claimant_user_id from community_groups cg
    where cg.community_id = new.community_id and cg.is_default
    on conflict (group_id, user_id) do nothing;

    insert into notifications (user_id, type, title, body, link)
    select new.claimant_user_id, 'claim_approved', 'Claim approved', c.name || ' is now yours to manage.', '/communities/' || new.community_id
    from communities c where c.id = new.community_id;
  elsif new.status = 'rejected' then
    update communities set claim_status = 'rejected' where id = new.community_id;
  end if;

  return new;
end;
$$;

-- =========================================================================
-- Organizer verified (auto-verification itself is 0060 -- this only
-- notifies on the actual false -> true transition, decoupled from
-- whichever trigger caused it, so it can never double-fire)
-- =========================================================================
create function public.notify_organizer_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, title, body, link)
  values (new.id, 'organizer_verified', 'You''re a verified organizer', 'Your profile now shows a verified organizer badge.', '/profile/' || new.id);
  return new;
end;
$$;
create trigger notify_on_organizer_verified
  after update of is_verified on profiles
  for each row
  when (new.is_verified = true and old.is_verified = false)
  execute function public.notify_organizer_verified();

-- =========================================================================
-- Founding marked (host + community, both admin-curated per 0054)
-- =========================================================================
create function public.notify_founding_host()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, title, body, link)
  values (new.id, 'founding_marked', 'Marked as a founding member', 'You''ve been marked as a founding member.', '/profile/' || new.id);
  return new;
end;
$$;
create trigger notify_on_founding_host
  after update of is_founding_host on profiles
  for each row
  when (new.is_founding_host = true and old.is_founding_host = false)
  execute function public.notify_founding_host();

create function public.notify_founding_community()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null then
    insert into notifications (user_id, type, title, body, link)
    values (new.owner_id, 'founding_marked', 'Community marked as founding', new.name || ' has been marked as a founding member.', '/communities/' || new.id);
  end if;
  return new;
end;
$$;
create trigger notify_on_founding_community
  after update of is_founding on communities
  for each row
  when (new.is_founding = true and old.is_founding = false)
  execute function public.notify_founding_community();

-- =========================================================================
-- Event messages from host -- only the "send now" case (send_at already
-- due at insert), same scope the app itself treats as an immediate send
-- vs. a scheduled one picked up later by the reminders cron/edge function.
-- =========================================================================
create function public.notify_event_reminder_now()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.send_at <= now() then
    insert into notifications (user_id, type, title, body, link)
    select distinct fr.respondent_id, 'event_message', 'Message from the host', new.message, '/events/' || new.event_id
    from form_responses fr
    where fr.owner_type = 'event' and fr.owner_id = new.event_id and fr.respondent_id is not null;
  end if;
  return new;
end;
$$;
create trigger notify_on_event_reminder_now
  after insert on event_reminders
  for each row execute function public.notify_event_reminder_now();

-- =========================================================================
-- Join request approved/rejected -- respondent notified. Only ever fires
-- on an actual reviewed transition (an UPDATE), not the initial insert --
-- an open-join's already-approved row never transitions, so this never
-- misfires for that path.
-- =========================================================================
create function public.notify_join_request_reviewed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.respondent_id is not null then
    insert into notifications (user_id, type, title, body, link)
    select new.respondent_id,
      case when new.status = 'approved' then 'join_request_approved' else 'join_request_rejected' end,
      case when new.status = 'approved' then 'Join request approved' else 'Join request declined' end,
      c.name,
      '/communities/' || new.owner_id
    from communities c where c.id = new.owner_id;
  end if;
  return new;
end;
$$;
create trigger notify_on_join_request_reviewed
  after update on form_responses
  for each row
  when (new.owner_type = 'community' and new.status is distinct from old.status and new.status in ('approved', 'rejected'))
  execute function public.notify_join_request_reviewed();

-- =========================================================================
-- New pending join request -- community owner notified (in-app, alongside
-- the existing email-only notifyOwnerOfPendingRequest).
-- =========================================================================
create function public.notify_new_join_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, title, body, link)
  select c.owner_id, 'join_request_pending', 'New join request', p.display_name || ' wants to join ' || c.name, '/host/dashboard#community-' || c.id
  from communities c
  join profiles p on p.id = new.respondent_id
  where c.id = new.owner_id and c.owner_id is not null;
  return new;
end;
$$;
create trigger notify_on_new_join_request
  after insert on form_responses
  for each row
  when (new.owner_type = 'community' and new.status = 'pending')
  execute function public.notify_new_join_request();

-- =========================================================================
-- Follow: new follower (instant follow) + follow request accepted
-- =========================================================================
create function public.notify_new_follower()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, title, body, link)
  select new.followee_id, 'new_follower', 'New follower', p.display_name || ' started following you', '/profile/' || new.follower_id
  from profiles p where p.id = new.follower_id;
  return new;
end;
$$;
create trigger notify_on_new_follower
  after insert on profile_follows
  for each row execute function public.notify_new_follower();

create function public.notify_follow_request_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, title, body, link)
  select new.requester_id, 'follow_request_accepted', 'Follow request accepted', p.display_name || ' accepted your follow request', '/profile/' || new.target_id
  from profiles p where p.id = new.target_id;
  return new;
end;
$$;
create trigger notify_on_follow_request_accepted
  after update on profile_follow_requests
  for each row
  when (new.status = 'accepted' and old.status is distinct from 'accepted')
  execute function public.notify_follow_request_accepted();

-- =========================================================================
-- Followed user creates a community / hosts an event -- fans out to
-- everyone following that user, whether via an instant follow or an
-- accepted follow request (both count as "following" here).
-- =========================================================================
create function public.notify_followers_of_new_community()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'native' and new.owner_id is not null then
    insert into notifications (user_id, type, title, body, link)
    select f.follower_id, 'followed_new_community', p.display_name || ' created a new community', new.name, '/communities/' || new.id
    from (
      select follower_id from profile_follows where followee_id = new.owner_id
      union
      select requester_id as follower_id from profile_follow_requests where target_id = new.owner_id and status = 'accepted'
    ) f
    join profiles p on p.id = new.owner_id;
  end if;
  return new;
end;
$$;
create trigger notify_on_new_community_for_followers
  after insert on communities
  for each row execute function public.notify_followers_of_new_community();

-- Two separate triggers (not one combined INSERT-or-UPDATE trigger) since
-- a WHEN clause can't reference OLD for an INSERT event -- an event starts
-- with a real date at normal creation (insert-time trigger fires), or
-- starts null via duplicateEvent() and gets its first real date later via
-- updateEvent (update-time trigger fires instead); never both.
create function public.notify_followers_of_new_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, type, title, body, link)
  select f.follower_id, 'followed_new_event', p.display_name || ' is hosting a new event', new.event_name, '/events/' || new.id
  from (
    select follower_id from profile_follows where followee_id = new.host_id
    union
    select requester_id as follower_id from profile_follow_requests where target_id = new.host_id and status = 'accepted'
  ) f
  join profiles p on p.id = new.host_id;
  return new;
end;
$$;
create trigger notify_on_new_event_for_followers_insert
  after insert on events
  for each row
  when (new.event_date is not null)
  execute function public.notify_followers_of_new_event();
create trigger notify_on_new_event_for_followers_update
  after update of event_date on events
  for each row
  when (new.event_date is not null and old.event_date is null)
  execute function public.notify_followers_of_new_event();
