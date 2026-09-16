-- Real bug caught live (drove the actual app, not just tsc): sent messages
-- saved correctly but never appeared in the thread until leaving and
-- re-entering the screen. Root cause is the exact one 0068's own comment
-- already warned about once before -- a table has to be explicitly added
-- to the supabase_realtime publication or postgres_changes subscriptions
-- for it never fire, regardless of how correct the RLS/client code is.
-- profile_dm_messages/profile_dm_threads (0123) were never added; neither
-- was dm_reads (0074), which silently meant "Seen" never updated live for
-- ANY DM kind (community/event included, not just the new profile one) --
-- it only ever refreshed on next screen load.
alter publication supabase_realtime add table profile_dm_messages;
alter publication supabase_realtime add table profile_dm_threads;
alter publication supabase_realtime add table dm_reads;
