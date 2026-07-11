-- Same reasoning as 0005_chat_realtime.sql -- the bell's unread badge
-- increments live via a postgres_changes subscription (NotificationBell),
-- which requires this table in the realtime publication.
alter publication supabase_realtime add table notifications;
