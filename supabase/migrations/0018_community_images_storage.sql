-- Storage bucket backing communities.logo_url/cover_image_url uploads --
-- same shape as event-images (0008), same 3MB/image-mime limits enforced at
-- the bucket level regardless of what a client claims. Path convention:
-- community-images/{community_id}/{logo|cover}-{uuid}.ext.
--
-- Owner-only (not is_community_staff): editing a community's own images is
-- scoped to the owner specifically, same restriction as the updateCommunity
-- Server Action -- moderators can manage groups/members but don't get to
-- change the community's branding.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-images', 'community-images', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "community_images_bucket_select_public" on storage.objects for select
  using (bucket_id = 'community-images');

create policy "community_images_bucket_insert_owner" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'community-images'
    and exists (
      select 1 from communities c
      where c.id = ((storage.foldername(name))[1])::uuid and c.owner_id = auth.uid()
    )
  );

create policy "community_images_bucket_delete_owner" on storage.objects for delete to authenticated
  using (
    bucket_id = 'community-images'
    and exists (
      select 1 from communities c
      where c.id = ((storage.foldername(name))[1])::uuid and c.owner_id = auth.uid()
    )
  );
