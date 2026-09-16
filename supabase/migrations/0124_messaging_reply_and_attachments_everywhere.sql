-- Brings reply-to and attachments to every message table that didn't
-- already have them (community_messages/0045 already has attachments;
-- this adds reply_to there too), so group chat, community DM, event DM,
-- and the new profile DM (0123) all support the same message shape.

alter table community_messages add column reply_to_message_id uuid references community_messages(id) on delete set null;

alter table community_dm_messages add column reply_to_message_id uuid references community_dm_messages(id) on delete set null;
alter table community_dm_messages alter column content drop not null;
alter table community_dm_messages add column attachment_path text;
alter table community_dm_messages add column attachment_type text check (attachment_type in ('image','video','file'));
alter table community_dm_messages add column attachment_name text;
alter table community_dm_messages add constraint community_dm_messages_has_content_or_attachment
  check (content is not null or attachment_path is not null);

alter table event_dm_messages add column reply_to_message_id uuid references event_dm_messages(id) on delete set null;
alter table event_dm_messages alter column content drop not null;
alter table event_dm_messages add column attachment_path text;
alter table event_dm_messages add column attachment_type text check (attachment_type in ('image','video','file'));
alter table event_dm_messages add column attachment_name text;
alter table event_dm_messages add constraint event_dm_messages_has_content_or_attachment
  check (content is not null or attachment_path is not null);

alter table profile_dm_messages add column reply_to_message_id uuid references profile_dm_messages(id) on delete set null;
alter table profile_dm_messages alter column content drop not null;
alter table profile_dm_messages add column attachment_path text;
alter table profile_dm_messages add column attachment_type text check (attachment_type in ('image','video','file'));
alter table profile_dm_messages add column attachment_name text;
alter table profile_dm_messages add constraint profile_dm_messages_has_content_or_attachment
  check (content is not null or attachment_path is not null);

-- One dispatcher so the chat-attachments bucket's RLS (and any future
-- caller) can check "is this user allowed into this DM thread" without
-- caring which of the three DM kinds it is.
create function public.is_dm_thread_participant(p_kind text, p_thread_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'community' then
    return exists (select 1 from community_dm_threads t where t.id = p_thread_id and (t.member_id = auth.uid() or is_community_staff(t.community_id)));
  elsif p_kind = 'event' then
    return exists (select 1 from event_dm_threads t where t.id = p_thread_id and (t.member_id = auth.uid() or is_event_host(t.event_id)));
  elsif p_kind = 'profile' then
    return exists (select 1 from profile_dm_threads t where t.id = p_thread_id and (t.requester_id = auth.uid() or t.recipient_id = auth.uid()));
  else
    return false;
  end if;
end;
$$;

-- DM attachment path convention: chat-attachments/dm/{kind}/{thread_id}/
-- {uuid}.ext -- a distinct top-level "dm" segment keeps this from ever
-- colliding with the existing group-chat convention (chat-attachments/
-- {group_id}/{uuid}.ext), so the two policy sets can't accidentally grant
-- each other's access.
create policy "chat_attachments_bucket_select_dm_participant" on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = 'dm'
    and is_dm_thread_participant((storage.foldername(name))[2], ((storage.foldername(name))[3])::uuid)
  );

create policy "chat_attachments_bucket_insert_dm_participant" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = 'dm'
    and is_dm_thread_participant((storage.foldername(name))[2], ((storage.foldername(name))[3])::uuid)
  );
