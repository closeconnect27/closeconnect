-- Real bug found after shipping 0067: community_dm_messages was never
-- added to the supabase_realtime publication, so DmModal's
-- postgres_changes subscription silently received nothing -- both sides
-- of a "Reach out to admin" conversation only ever saw a new message
-- after closing and reopening it. Same gap 0005_chat_realtime.sql fixed
-- for community_messages; RLS/inserts worked fine the whole time, this is
-- purely a Realtime-delivery gap.
alter publication supabase_realtime add table community_dm_messages;
