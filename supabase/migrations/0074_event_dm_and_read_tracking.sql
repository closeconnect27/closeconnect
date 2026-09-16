-- "Contact host": a registrant can DM an event's host directly, two-way --
-- exact same shape as community_dm_threads/community_dm_messages (0067),
-- just event_id/is_event_host instead of community_id/is_community_staff.
-- One thread per (event, attendee) pair.
create table event_dm_threads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  member_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (event_id, member_id)
);
create index event_dm_threads_event_idx on event_dm_threads(event_id, created_at desc);

create table event_dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references event_dm_threads(id) on delete cascade not null,
  sender_id uuid references profiles(id) not null,
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz default now()
);
create index event_dm_messages_thread_idx on event_dm_messages(thread_id, created_at);

alter table event_dm_threads enable row level security;
alter table event_dm_messages enable row level security;

create policy "event_dm_threads_select" on event_dm_threads for select to authenticated
  using (member_id = auth.uid() or is_event_host(event_id));
create policy "event_dm_threads_insert_own" on event_dm_threads for insert to authenticated
  with check (member_id = auth.uid());

create policy "event_dm_messages_select" on event_dm_messages for select to authenticated
  using (
    exists (
      select 1 from event_dm_threads t
      where t.id = thread_id and (t.member_id = auth.uid() or is_event_host(t.event_id))
    )
  );
create policy "event_dm_messages_insert" on event_dm_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from event_dm_threads t
      where t.id = thread_id and (t.member_id = auth.uid() or is_event_host(t.event_id))
    )
  );

-- Same 1-message-per-2-seconds shape as the community DM rate limit (0067).
create index event_dm_messages_rate_limit_idx on event_dm_messages(thread_id, sender_id, created_at desc);
create function public.enforce_event_dm_rate_limit()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from event_dm_messages
    where thread_id = new.thread_id and sender_id = new.sender_id and created_at > now() - interval '2 seconds'
  ) then
    raise exception 'Sending messages too quickly -- please wait a moment.';
  end if;
  return new;
end;
$$;
create trigger event_dm_messages_rate_limit
  before insert on event_dm_messages
  for each row execute function public.enforce_event_dm_rate_limit();

-- Reuses the existing 'dm_received' notification type (0067) -- generic
-- enough already, no constraint change needed. Registrant-side link goes
-- to the event page; host-side link goes to the manage page with a
-- ?dmThread= param so NotificationBell's click-through can deep-link
-- straight into the specific conversation instead of just the inbox list.
create function public.notify_event_dm_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_member_id uuid;
  v_event_id uuid;
  v_host_id uuid;
  v_event_name text;
  v_sender_name text;
begin
  select member_id, event_id into v_member_id, v_event_id
  from event_dm_threads where id = new.thread_id;

  select host_id, event_name into v_host_id, v_event_name
  from events where id = v_event_id;

  if new.sender_id = v_member_id then
    if v_host_id is not null then
      select display_name into v_sender_name from profiles where id = new.sender_id;
      insert into notifications (user_id, type, title, body, link)
      values (
        v_host_id, 'dm_received', v_sender_name || ' sent you a message', v_event_name,
        '/events/' || v_event_id || '/manage?dmThread=' || new.thread_id
      );
    end if;
  else
    insert into notifications (user_id, type, title, body, link)
    values (v_member_id, 'dm_received', v_event_name || ' replied to you', left(new.content, 140), '/events/' || v_event_id);
  end if;

  return new;
end;
$$;
create trigger event_dm_message_notify
  after insert on event_dm_messages
  for each row execute function public.notify_event_dm_message();

-- ---------------------------------------------------------------------
-- Per-user "last read" marker, shared by both DM systems -- the actual
-- fix for "the message count should go away once read": previously
-- DmInboxSection's "Messages (N)" showed the total thread count, which
-- never changed after reading. thread_kind + thread_id is a composite
-- key rather than a foreign key to either thread table specifically,
-- since one row type needs to reference either of two unrelated tables.
-- ---------------------------------------------------------------------
create table dm_reads (
  thread_kind text not null check (thread_kind in ('community', 'event')),
  thread_id uuid not null,
  user_id uuid references profiles(id) on delete cascade not null,
  last_read_at timestamptz not null default now(),
  primary key (thread_kind, thread_id, user_id)
);

alter table dm_reads enable row level security;

create policy "dm_reads_select_own" on dm_reads for select to authenticated
  using (user_id = auth.uid());
create policy "dm_reads_upsert_own" on dm_reads for insert to authenticated
  with check (user_id = auth.uid());
create policy "dm_reads_update_own" on dm_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
