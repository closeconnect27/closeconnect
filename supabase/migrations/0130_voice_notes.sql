-- Voice notes: a fifth attachment_type alongside image/video/file/gif
-- (0045, 0124, 0128) across every message table that already carries
-- attachments -- group chat, community DM, event DM, profile DM. Storage
-- path/RLS/upload plumbing is all already generic over attachment_type, so
-- this is purely a constraint + a duration column (so the player can show
-- "0:12" before the audio has loaded, same reason WhatsApp/Instagram show
-- it up front) -- no new table.

alter table community_messages drop constraint community_messages_attachment_type_check;
alter table community_messages add constraint community_messages_attachment_type_check check (attachment_type in ('image','video','file','gif','voice'));
alter table community_messages add column attachment_duration_seconds int;

alter table community_dm_messages drop constraint community_dm_messages_attachment_type_check;
alter table community_dm_messages add constraint community_dm_messages_attachment_type_check check (attachment_type in ('image','video','file','gif','voice'));
alter table community_dm_messages add column attachment_duration_seconds int;

alter table event_dm_messages drop constraint event_dm_messages_attachment_type_check;
alter table event_dm_messages add constraint event_dm_messages_attachment_type_check check (attachment_type in ('image','video','file','gif','voice'));
alter table event_dm_messages add column attachment_duration_seconds int;

alter table profile_dm_messages drop constraint profile_dm_messages_attachment_type_check;
alter table profile_dm_messages add constraint profile_dm_messages_attachment_type_check check (attachment_type in ('image','video','file','gif','voice'));
alter table profile_dm_messages add column attachment_duration_seconds int;
