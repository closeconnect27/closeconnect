-- dm_reads_upsert_own/dm_reads_update_own (0075) only ever handled
-- thread_kind 'community' and 'event' -- that policy predates profile DM
-- (0123), and nothing added a matching branch when it landed. Every
-- markDmThreadRead("profile", ...) call has been silently rejected by RLS
-- since the feature was built (the client swallows the error into a
-- console.error, so this never surfaced as a visible failure) -- "I read
-- the message but it still shows as unread" is this: dm_reads never had a
-- row for a profile-kind thread at all, ever, for any user.
drop policy "dm_reads_upsert_own" on dm_reads;
drop policy "dm_reads_update_own" on dm_reads;

create policy "dm_reads_upsert_own" on dm_reads for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (thread_kind = 'community' and exists (
        select 1 from community_dm_threads t where t.id = thread_id and (t.member_id = auth.uid() or is_community_staff(t.community_id))
      ))
      or
      (thread_kind = 'event' and exists (
        select 1 from event_dm_threads t where t.id = thread_id and (t.member_id = auth.uid() or is_event_host(t.event_id))
      ))
      or
      (thread_kind = 'profile' and exists (
        select 1 from profile_dm_threads t where t.id = thread_id and (t.requester_id = auth.uid() or t.recipient_id = auth.uid())
      ))
    )
  );
create policy "dm_reads_update_own" on dm_reads for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      (thread_kind = 'community' and exists (
        select 1 from community_dm_threads t where t.id = thread_id and (t.member_id = auth.uid() or is_community_staff(t.community_id))
      ))
      or
      (thread_kind = 'event' and exists (
        select 1 from event_dm_threads t where t.id = thread_id and (t.member_id = auth.uid() or is_event_host(t.event_id))
      ))
      or
      (thread_kind = 'profile' and exists (
        select 1 from profile_dm_threads t where t.id = thread_id and (t.requester_id = auth.uid() or t.recipient_id = auth.uid())
      ))
    )
  );
