-- The in-house LiveKit video/voice call feature has been removed entirely
-- (calls, recording, the /events/[id]/call route and its mobile
-- equivalent) -- meeting_link is now mandatory for online events instead
-- (src/lib/validation/event.ts), so there's always an external place to
-- join. This drops the one piece of DB state that only ever existed to
-- back the removed feature: the LiveKit webhook's auto-check-in-via-call-
-- attendance column (0077). Manual/host-driven check-in (setCheckInCount,
-- events.ts) and everything downstream of checked_in_at (event feedback
-- eligibility, is_checked_in_attendee) are untouched -- they never
-- depended on LiveKit, only on checked_in_at itself, which this migration
-- doesn't touch.
alter table form_responses drop column livekit_attended_seconds;

-- GIF support (Giphy) across every message surface -- a GIF's
-- attachment_path holds the actual external Giphy CDN URL directly (never
-- a chat-attachments storage path), since Giphy already hosts and serves
-- it; the app's signed-URL resolution is skipped entirely for this type,
-- same distinction the client makes between 'image'/'video' (storage path)
-- and 'gif' (already a public URL).
alter table community_messages drop constraint community_messages_attachment_type_check;
alter table community_messages add constraint community_messages_attachment_type_check check (attachment_type in ('image','video','file','gif'));

alter table community_dm_messages drop constraint community_dm_messages_attachment_type_check;
alter table community_dm_messages add constraint community_dm_messages_attachment_type_check check (attachment_type in ('image','video','file','gif'));

alter table event_dm_messages drop constraint event_dm_messages_attachment_type_check;
alter table event_dm_messages add constraint event_dm_messages_attachment_type_check check (attachment_type in ('image','video','file','gif'));

alter table profile_dm_messages drop constraint profile_dm_messages_attachment_type_check;
alter table profile_dm_messages add constraint profile_dm_messages_attachment_type_check check (attachment_type in ('image','video','file','gif'));
