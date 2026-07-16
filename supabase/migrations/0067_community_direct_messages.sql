-- "Reach out to admin": a member can DM a native community's owner
-- directly, two-way. One thread per (community, member) pair -- simpler
-- than a general-purpose DM system since the "other party" on the staff
-- side is always just "whoever owns/moderates this community", not a
-- specific person the member picks.
create table community_dm_threads (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id) on delete cascade not null,
  member_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (community_id, member_id)
);
create index community_dm_threads_community_idx on community_dm_threads(community_id, created_at desc);

create table community_dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references community_dm_threads(id) on delete cascade not null,
  sender_id uuid references profiles(id) not null,
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz default now()
);
create index community_dm_messages_thread_idx on community_dm_messages(thread_id, created_at);

alter table community_dm_threads enable row level security;
alter table community_dm_messages enable row level security;

-- A thread is visible to the member it belongs to, or that community's
-- owner/moderators (is_community_staff, 0001) -- nobody else, including
-- other members, ever sees it.
create policy "community_dm_threads_select" on community_dm_threads for select to authenticated
  using (member_id = auth.uid() or is_community_staff(community_id));
-- Only the member themselves originates their own thread -- staff reply
-- into an existing one (replyToCommunityDm), they never create one, so no
-- insert policy branch for is_community_staff here.
create policy "community_dm_threads_insert_own" on community_dm_threads for insert to authenticated
  with check (member_id = auth.uid());

create policy "community_dm_messages_select" on community_dm_messages for select to authenticated
  using (
    exists (
      select 1 from community_dm_threads t
      where t.id = thread_id and (t.member_id = auth.uid() or is_community_staff(t.community_id))
    )
  );
create policy "community_dm_messages_insert" on community_dm_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from community_dm_threads t
      where t.id = thread_id and (t.member_id = auth.uid() or is_community_staff(t.community_id))
    )
  );

-- Same 1-message-per-2-seconds shape as group chat (0004).
create index community_dm_messages_rate_limit_idx on community_dm_messages(thread_id, sender_id, created_at desc);
create function public.enforce_dm_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from community_dm_messages
    where thread_id = new.thread_id and sender_id = new.sender_id and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'Sending messages too quickly -- please wait a moment.';
  end if;
  return new;
end;
$$;
create trigger community_dm_messages_rate_limit
  before insert on community_dm_messages
  for each row execute function public.enforce_dm_rate_limit();

alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
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
  'followed_new_event',
  'payment_submitted',
  'payment_confirmed',
  'dm_received'
));

-- Cross-user (whichever side didn't just send it), so a security definer
-- trigger, same convention as review_community_claim/approve_join_request
-- -- neither party's own RLS-scoped client could insert a notification for
-- the *other* person.
create function public.notify_dm_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_member_id uuid;
  v_community_id uuid;
  v_owner_id uuid;
  v_community_name text;
  v_sender_name text;
begin
  select member_id, community_id into v_member_id, v_community_id
  from community_dm_threads where id = new.thread_id;

  select owner_id, name into v_owner_id, v_community_name
  from communities where id = v_community_id;

  if new.sender_id = v_member_id then
    if v_owner_id is not null then
      select display_name into v_sender_name from profiles where id = new.sender_id;
      insert into notifications (user_id, type, title, body, link)
      values (v_owner_id, 'dm_received', v_sender_name || ' sent you a message', v_community_name, '/communities/' || v_community_id);
    end if;
  else
    insert into notifications (user_id, type, title, body, link)
    values (v_member_id, 'dm_received', v_community_name || ' replied to you', left(new.content, 140), '/communities/' || v_community_id);
  end if;

  return new;
end;
$$;
create trigger community_dm_message_notify
  after insert on community_dm_messages
  for each row execute function public.notify_dm_message();
