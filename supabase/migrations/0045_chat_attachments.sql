-- Chat attachments (images, videos, files) -- content becomes optional so
-- a message can be attachment-only, but a message must still carry
-- something (text or an attachment), not neither.
alter table community_messages drop constraint community_messages_content_check;
alter table community_messages alter column content drop not null;
alter table community_messages add constraint community_messages_content_check
  check (content is null or char_length(content) between 1 and 1000);

-- attachment_path (not attachment_url): this bucket is private, scoped to
-- group members the same way the messages themselves are
-- (community_messages_select_group_members, 0001/0020) -- unlike
-- community-images/event-images, chat attachments are never public, so a
-- plain public URL wouldn't actually serve the file. What's stored here is
-- a storage path the app resolves to a signed URL per-viewer, per-request.
alter table community_messages add column attachment_path text;
alter table community_messages add column attachment_type text check (attachment_type in ('image','video','file'));
alter table community_messages add column attachment_name text;
alter table community_messages add constraint community_messages_has_content_or_attachment
  check (content is not null or attachment_path is not null);

-- One bucket for every attachment kind rather than three -- the app
-- enforces tighter per-kind size checks client-side before upload (images
-- 5MB, videos 25MB, generic files 10MB); this 25MB cap is the hard
-- backstop regardless of what a client claims. NOT public (see above) --
-- path convention chat-attachments/{group_id}/{uuid}.ext, same shape as
-- community-images/event-images otherwise.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 26214400, array[
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/webm','video/quicktime',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip','text/plain'
])
on conflict (id) do nothing;

-- Select is required even for a private bucket -- createSignedUrl() still
-- checks this policy before minting a URL, same as any other read.
create policy "chat_attachments_bucket_select_member" on storage.objects for select to authenticated
  using (bucket_id = 'chat-attachments' and is_group_member(((storage.foldername(name))[1])::uuid));

create policy "chat_attachments_bucket_insert_member" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-attachments' and is_group_member(((storage.foldername(name))[1])::uuid));
