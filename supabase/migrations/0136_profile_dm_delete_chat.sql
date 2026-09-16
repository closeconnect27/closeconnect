-- "Delete chat" -- per-user, not a shared hard delete: removes a thread
-- from MY inbox without touching the other participant's copy or the
-- underlying messages (same "delete for me" semantics as WhatsApp/
-- Instagram, not a destructive shared-state mutation). Mirrors dm_reads'
-- own shape (one row per user per thread) rather than adding asymmetric
-- columns to profile_dm_threads itself.
--
-- A thread reappears automatically once a NEW message arrives after
-- hidden_at -- the inbox query filters out a thread only when
-- hidden_at >= last_message_at, so hiding is "clear up to now," not
-- "block this thread forever."
create table profile_dm_thread_hides (
  thread_id uuid references profile_dm_threads(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  hidden_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index profile_dm_thread_hides_user_idx on profile_dm_thread_hides(user_id);

alter table profile_dm_thread_hides enable row level security;

create policy "profile_dm_thread_hides_select_own" on profile_dm_thread_hides for select to authenticated
  using (user_id = auth.uid());

create policy "profile_dm_thread_hides_insert_own" on profile_dm_thread_hides for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from profile_dm_threads t where t.id = thread_id and (t.requester_id = auth.uid() or t.recipient_id = auth.uid()))
  );

create policy "profile_dm_thread_hides_update_own" on profile_dm_thread_hides for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from profile_dm_threads t where t.id = thread_id and (t.requester_id = auth.uid() or t.recipient_id = auth.uid()))
  );

create policy "profile_dm_thread_hides_delete_own" on profile_dm_thread_hides for delete to authenticated
  using (user_id = auth.uid());
