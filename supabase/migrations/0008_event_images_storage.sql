-- Storage bucket backing event_images (0003_event_images.sql added the table/
-- RLS but deferred the upload UI to "once event creation/detail pages
-- exist" -- this is the first real file upload in the app (everything else
-- uses the seeded Unsplash category-image system), so the bucket policy is
-- new infrastructure, not a copy of an existing pattern.
--
-- Path convention: event-images/{event_id}/{filename}. The event row must
-- already exist before an image can be uploaded to its folder (host_id is
-- checked against the *existing* events row), so upload happens after event
-- creation, not as part of the same step -- see EventImageUploader.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "event_images_bucket_select_public" on storage.objects for select
  using (bucket_id = 'event-images');

create policy "event_images_bucket_insert_host" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-images'
    and is_event_host(((storage.foldername(name))[1])::uuid)
  );

create policy "event_images_bucket_delete_host" on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-images'
    and is_event_host(((storage.foldername(name))[1])::uuid)
  );
