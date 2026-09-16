-- Two real bugs surfaced by live testing tonight:
--
-- 1. The ORIGINAL group-chat storage policies (0045) blindly cast the
--    path's first segment to uuid: `((storage.foldername(name))[1])::uuid`.
--    That was fine when every path was `{group_id}/{file}`, but 0124's DM
--    convention (`dm/{kind}/{thread_id}/{file}`) means an upload into a DM
--    thread has "dm" (a literal string, not a uuid) as that first segment.
--    RLS evaluates every permissive policy on the table for the operation,
--    and Postgres does not treat one policy throwing an error as "that
--    policy denies" -- it fails the WHOLE query, even though the correct,
--    newer DM-participant policy (0124) would have allowed it. Guarded with
--    a regex so the cast is only ever attempted on an actual uuid-shaped
--    segment, matching the same guard pattern this fix establishes.
drop policy "chat_attachments_bucket_select_member" on storage.objects;
create policy "chat_attachments_bucket_select_member" on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and is_group_member(((storage.foldername(name))[1])::uuid)
  );

drop policy "chat_attachments_bucket_insert_member" on storage.objects;
create policy "chat_attachments_bucket_insert_member" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and is_group_member(((storage.foldername(name))[1])::uuid)
  );

-- 2. Voice notes (0130) added 'voice' as a message attachment_type, but
--    never widened the chat-attachments BUCKET's own allowed_mime_types --
--    every voice note upload was rejected at the storage layer regardless.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/webm','video/quicktime',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip','text/plain',
  'audio/m4a','audio/mp4','audio/webm','audio/ogg','audio/mpeg'
]
where id = 'chat-attachments';
