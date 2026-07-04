-- Without this, postgres_changes Realtime subscriptions on community_messages
-- silently receive nothing -- RLS/triggers still work fine for direct
-- queries, so this gap wouldn't show up in any of the RLS test suite's
-- checks, only in an actual Realtime subscription.
alter publication supabase_realtime add table community_messages;
