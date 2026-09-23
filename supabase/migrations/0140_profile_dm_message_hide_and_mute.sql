-- "Delete for you" vs "Delete for everyone" on a profile DM message
-- (WhatsApp's own split): everyone can already hard-delete their OWN
-- message for both sides (profile_dm_messages_delete_own, 0123) -- that
-- stays "delete for everyone". What's missing is a way to hide ANY
-- message (yours or theirs) from just your own view without touching the
-- other participant's copy. Same per-viewer-row shape as
-- profile_dm_thread_hides (0136), scoped to one message instead of a
-- whole thread.
create table profile_dm_message_hides (
  message_id uuid references profile_dm_messages(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index profile_dm_message_hides_user_idx on profile_dm_message_hides(user_id);

alter table profile_dm_message_hides enable row level security;

create policy "profile_dm_message_hides_select_own" on profile_dm_message_hides for select to authenticated
  using (user_id = auth.uid());

create policy "profile_dm_message_hides_insert_own" on profile_dm_message_hides for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from profile_dm_messages m
      join profile_dm_threads t on t.id = m.thread_id
      where m.id = message_id and (t.requester_id = auth.uid() or t.recipient_id = auth.uid())
    )
  );

-- Folding the exclusion straight into the SELECT policy (rather than a
-- view, or filtering client-side) means every existing call site -- web
-- and native both select the raw table directly -- gets "delete for you"
-- for free, with no call-site changes.
drop policy "profile_dm_messages_select_participant" on profile_dm_messages;
create policy "profile_dm_messages_select_participant" on profile_dm_messages for select to authenticated
  using (
    exists (
      select 1 from profile_dm_threads t
      where t.id = thread_id and (t.requester_id = auth.uid() or t.recipient_id = auth.uid())
    )
    and not exists (
      select 1 from profile_dm_message_hides h where h.message_id = id and h.user_id = auth.uid()
    )
  );

-- Per-thread mute: suppresses the push notification (0139's
-- on_profile_dm_message_sent) for this one thread without touching
-- anything else -- the thread still appears normally in the inbox and in
-- app, only the push is skipped.
create table profile_dm_thread_mutes (
  thread_id uuid references profile_dm_threads(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  muted_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index profile_dm_thread_mutes_user_idx on profile_dm_thread_mutes(user_id);

alter table profile_dm_thread_mutes enable row level security;

create policy "profile_dm_thread_mutes_select_own" on profile_dm_thread_mutes for select to authenticated
  using (user_id = auth.uid());

create policy "profile_dm_thread_mutes_insert_own" on profile_dm_thread_mutes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from profile_dm_threads t where t.id = thread_id and (t.requester_id = auth.uid() or t.recipient_id = auth.uid()))
  );

create policy "profile_dm_thread_mutes_delete_own" on profile_dm_thread_mutes for delete to authenticated
  using (user_id = auth.uid());

-- Re-adds the mute check to 0139's version of this function -- everything
-- else (thread status flip, last_message_at bump) is unchanged.
create or replace function public.on_profile_dm_message_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread record;
  v_recipient_id uuid;
begin
  select * into v_thread from profile_dm_threads where id = new.thread_id;

  if v_thread.status = 'pending' and new.sender_id = v_thread.recipient_id then
    update profile_dm_threads set status = 'accepted', last_message_at = new.created_at where id = new.thread_id;
  else
    update profile_dm_threads set last_message_at = new.created_at where id = new.thread_id;
  end if;

  v_recipient_id := case when new.sender_id = v_thread.requester_id then v_thread.recipient_id else v_thread.requester_id end;

  if not exists (select 1 from profile_dm_thread_mutes where thread_id = new.thread_id and user_id = v_recipient_id) then
    perform send_push_only(
      v_recipient_id,
      case when v_thread.status = 'pending' and new.sender_id = v_thread.requester_id then 'New message request' else 'New message' end,
      left(new.content, 120),
      '/messages/' || new.thread_id,
      'dm_received'
    );
  end if;

  return new;
end;
$$;
