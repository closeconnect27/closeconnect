-- WhatsApp-style unread counts per group: one row per (group, user)
-- recording when that user last read that group's chat. Unread count for
-- a group is just "messages newer than last_read_at, not sent by the
-- viewer themself" -- computed on read via getUnreadCounts, not
-- maintained as a running counter (simpler, and self-corrects if a
-- message is ever deleted since it's derived, not incremented/decremented
-- by triggers that could drift).
create table community_group_reads (
  group_id uuid references community_groups(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  last_read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table community_group_reads enable row level security;

create policy "community_group_reads_select_own" on community_group_reads for select to authenticated
  using (user_id = auth.uid());
create policy "community_group_reads_upsert_own" on community_group_reads for insert to authenticated
  with check (user_id = auth.uid() and is_group_member(group_id));
create policy "community_group_reads_update_own" on community_group_reads for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Security-definer count function, same reasoning as
-- get_event_interest_count (0040): a caller can only ever get counts for
-- their own last_read_at (auth.uid() is baked in, not a parameter), so
-- there's no way to probe another member's read state through this.
create function public.get_group_unread_count(p_group_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from community_messages
  where group_id = p_group_id
    and user_id != auth.uid()
    and created_at > coalesce(
      (select last_read_at from community_group_reads where group_id = p_group_id and user_id = auth.uid()),
      'epoch'::timestamptz
    );
$$;
