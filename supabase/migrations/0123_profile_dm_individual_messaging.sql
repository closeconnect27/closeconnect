-- Direct 1:1 messaging between any two users (not scoped to a community or
-- event, unlike the existing community_dm_*/event_dm_* tables). Instagram-
-- style message requests: a thread starts 'pending' unless the recipient
-- already follows the requester (an existing sign of trust), in which case
-- it goes straight to their main inbox as 'accepted'. The recipient's own
-- first reply also auto-accepts a pending thread -- replying is an implicit
-- accept, same as most DM products.

create table profile_dm_threads (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references profiles(id) on delete cascade not null,
  recipient_id uuid references profiles(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  last_message_at timestamptz default now(),
  check (requester_id <> recipient_id)
);
-- One thread per pair, ever, regardless of who messaged first -- least/
-- greatest normalizes the unordered pair so (A,B) and (B,A) collide.
create unique index profile_dm_threads_pair_idx on profile_dm_threads (least(requester_id, recipient_id), greatest(requester_id, recipient_id));
create index profile_dm_threads_recipient_idx on profile_dm_threads(recipient_id, status);
create index profile_dm_threads_requester_idx on profile_dm_threads(requester_id, status);

create table profile_dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references profile_dm_threads(id) on delete cascade not null,
  sender_id uuid references profiles(id) not null,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz default now()
);
create index profile_dm_messages_thread_idx on profile_dm_messages(thread_id, created_at);

alter table profile_dm_threads enable row level security;
alter table profile_dm_messages enable row level security;

create policy "profile_dm_threads_select_participant" on profile_dm_threads for select to authenticated
  using (requester_id = auth.uid() or recipient_id = auth.uid());

create policy "profile_dm_threads_insert_own" on profile_dm_threads for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'pending'
    and not is_blocked_pair(requester_id, recipient_id)
  );

-- Only the recipient decides accepted vs declined, and only while still
-- pending -- `using` gates the pre-update row, `with check` the post-update
-- one, so this can't be used to revive a declined thread or let the
-- requester self-accept.
create policy "profile_dm_threads_update_recipient" on profile_dm_threads for update to authenticated
  using (recipient_id = auth.uid() and status = 'pending')
  with check (recipient_id = auth.uid() and status in ('accepted', 'declined'));

create policy "profile_dm_messages_select_participant" on profile_dm_messages for select to authenticated
  using (
    exists (
      select 1 from profile_dm_threads t
      where t.id = thread_id and (t.requester_id = auth.uid() or t.recipient_id = auth.uid())
    )
  );

-- While a thread is still pending, only the requester can send (possibly
-- several messages, e.g. a short intro) -- the recipient can't reply into a
-- request they haven't accepted yet, matching profile_dm_threads_update_
-- recipient's own gate. Once accepted, either side can send freely. A
-- declined thread accepts nothing further from anyone.
create policy "profile_dm_messages_insert" on profile_dm_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from profile_dm_threads t
      where t.id = thread_id
        and (
          (t.status = 'accepted' and (t.requester_id = auth.uid() or t.recipient_id = auth.uid()))
          or (t.status = 'pending' and t.requester_id = auth.uid())
        )
        and not is_blocked_pair(t.requester_id, t.recipient_id)
    )
  );

create policy "profile_dm_messages_delete_own" on profile_dm_messages for delete to authenticated
  using (sender_id = auth.uid());

create index profile_dm_messages_rate_limit_idx on profile_dm_messages(sender_id, created_at desc);
create function public.enforce_profile_dm_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from profile_dm_messages
    where sender_id = new.sender_id and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'Sending messages too quickly -- please wait a moment.';
  end if;
  return new;
end;
$$;
create trigger profile_dm_messages_rate_limit
  before insert on profile_dm_messages
  for each row execute function public.enforce_profile_dm_rate_limit();

-- security definer: needs to (a) auto-accept a pending thread on the
-- recipient's first reply and (b) bump last_message_at, both writes to a
-- row the inserting user doesn't own outright (recipient replying into a
-- thread the requester created) -- same reasoning as every other
-- cross-user trigger in this app (notify_new_follow_request etc.).
create function public.on_profile_dm_message_sent()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_thread record;
begin
  select * into v_thread from profile_dm_threads where id = new.thread_id;

  if v_thread.status = 'pending' and new.sender_id = v_thread.recipient_id then
    update profile_dm_threads set status = 'accepted', last_message_at = new.created_at where id = new.thread_id;
  else
    update profile_dm_threads set last_message_at = new.created_at where id = new.thread_id;
  end if;

  insert into notifications (user_id, type, title, body, link)
  select
    case when new.sender_id = v_thread.requester_id then v_thread.recipient_id else v_thread.requester_id end,
    'dm_received',
    case when v_thread.status = 'pending' and new.sender_id = v_thread.requester_id then 'New message request' else 'New message' end,
    left(new.content, 120),
    '/messages/' || new.thread_id;

  return new;
end;
$$;
create trigger profile_dm_message_sent
  after insert on profile_dm_messages
  for each row execute function public.on_profile_dm_message_sent();

-- dm_reads (0074) already generically supports any thread_kind via its
-- (thread_kind, thread_id, user_id) primary key -- just needs 'profile'
-- added to the check constraint that currently only allows
-- ('community', 'event').
alter table dm_reads drop constraint dm_reads_thread_kind_check;
alter table dm_reads add constraint dm_reads_thread_kind_check check (thread_kind in ('community', 'event', 'profile'));
