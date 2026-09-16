-- Lets a user stop another specific person from contacting them --
-- required for Google Play's User Generated Content policy (report +
-- block, this app already had report via the `reports` table but no
-- block at all). One-directional row (blocker decides), but every check
-- below treats a block as mutual -- if either side has blocked the
-- other, neither can newly contact the other.
create table blocked_users (
  blocker_id uuid references profiles(id) on delete cascade not null,
  blocked_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id != blocked_id)
);
create index blocked_users_blocked_idx on blocked_users(blocked_id);

alter table blocked_users enable row level security;

-- A block is only ever visible to the person who made it -- the blocked
-- party isn't told (same posture as most social apps: blocking is silent,
-- not a public or even semi-public signal).
create policy "blocked_users_select_own" on blocked_users for select to authenticated
  using (blocker_id = auth.uid());
create policy "blocked_users_insert_own" on blocked_users for insert to authenticated
  with check (blocker_id = auth.uid());
create policy "blocked_users_delete_own" on blocked_users for delete to authenticated
  using (blocker_id = auth.uid());

-- security definer, same reasoning as is_community_staff/shares_community_with:
-- every call site below needs to check a block from EITHER direction
-- without itself being blocked from reading the other person's own block
-- row (blocked_users_select_own only lets you read rows you created).
create function public.is_blocked_pair(p_user_a uuid, p_user_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocked_users
    where (blocker_id = p_user_a and blocked_id = p_user_b)
       or (blocker_id = p_user_b and blocked_id = p_user_a)
  );
$$;

-- Follows: a block prevents a NEW follow/follow-request from forming in
-- either direction (an existing one isn't retroactively torn down here --
-- unfollowing is already a separate, always-available action).
drop policy "profile_follows_insert_own" on profile_follows;
create policy "profile_follows_insert_own" on profile_follows for insert to authenticated
  with check (
    follower_id = auth.uid()
    and not is_blocked_pair(follower_id, followee_id)
    and exists (
      select 1 from profiles p
      where p.id = followee_id
      and (p.profile_visibility = 'public' or (p.profile_visibility = 'members_only' and shares_community_with(p.id)))
    )
  );

drop policy "pfr_insert_own" on profile_follow_requests;
create policy "pfr_insert_own" on profile_follow_requests for insert to authenticated
  with check (requester_id = auth.uid() and not is_blocked_pair(requester_id, target_id));

-- Community DM: the member's own thread has no single fixed counterpart
-- (any current owner/moderator can reply into it), so a member's own
-- messages/thread-creation check against the community's OWNER
-- specifically -- the same single fixed contact "message host" already
-- treats as the community's point of contact. Staff's own messages check
-- against the specific member on that thread, which is unambiguous.
drop policy "community_dm_threads_insert_own" on community_dm_threads;
create policy "community_dm_threads_insert_own" on community_dm_threads for insert to authenticated
  with check (
    member_id = auth.uid()
    and not is_blocked_pair(member_id, (select owner_id from communities where id = community_id))
  );

drop policy "community_dm_messages_insert" on community_dm_messages;
create policy "community_dm_messages_insert" on community_dm_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from community_dm_threads t
      where t.id = thread_id and (t.member_id = auth.uid() or is_community_staff(t.community_id))
      and not is_blocked_pair(
        sender_id,
        case when sender_id = t.member_id then (select owner_id from communities where id = t.community_id) else t.member_id end
      )
    )
  );

-- Event DM: member_id/host_id are both fixed on the thread, so this is
-- unambiguous either direction.
drop policy "event_dm_threads_insert_own" on event_dm_threads;
create policy "event_dm_threads_insert_own" on event_dm_threads for insert to authenticated
  with check (
    member_id = auth.uid()
    and not is_blocked_pair(member_id, (select host_id from events where id = event_id))
  );

drop policy "event_dm_messages_insert" on event_dm_messages;
create policy "event_dm_messages_insert" on event_dm_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from event_dm_threads t
      where t.id = thread_id and (t.member_id = auth.uid() or is_event_host(t.event_id))
      and not is_blocked_pair(
        sender_id,
        case when sender_id = t.member_id then (select host_id from events where id = t.event_id) else t.member_id end
      )
    )
  );
