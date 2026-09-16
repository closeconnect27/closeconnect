-- Sender-only hard delete, across every message surface: community Circle
-- chat, community DMs, event DMs. Explicit product decision -- no staff/
-- host moderation power over other people's messages, and no soft-delete
-- placeholder ("message deleted") -- a deleted row is just gone.

-- community_messages already had a delete policy (0001_init.sql) letting
-- community staff delete anyone's message in their own community too --
-- narrowed to sender-only to actually match this decision, not leave a
-- wider door open at the RLS layer than the UI ever offers.
drop policy "community_messages_delete_own_or_staff" on community_messages;
create policy "community_messages_delete_own" on community_messages for delete to authenticated
  using (user_id = auth.uid());

create policy "community_dm_messages_delete_own" on community_dm_messages for delete to authenticated
  using (sender_id = auth.uid());

create policy "event_dm_messages_delete_own" on event_dm_messages for delete to authenticated
  using (sender_id = auth.uid());
