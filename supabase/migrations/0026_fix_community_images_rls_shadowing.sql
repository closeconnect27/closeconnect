-- Regression sweep finding: 0018's insert/delete policies for the
-- community-images bucket wrote `storage.foldername(name)` inside a
-- correlated EXISTS subquery against `communities c`. Since communities has
-- its own `name` column, Postgres's normal scoping rules resolve the bare
-- `name` reference to communities.name (the community's display name), not
-- the intended storage.objects.name (the upload path) -- silently shadowing
-- the correlation entirely. The ownership check could then never match a
-- real path, so every legitimate owner upload/delete was rejected by RLS.
-- Fix: qualify the reference to the outer table explicitly.
drop policy "community_images_bucket_insert_owner" on storage.objects;
create policy "community_images_bucket_insert_owner" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'community-images'
    and exists (
      select 1 from communities c
      where c.id = ((storage.foldername(storage.objects.name))[1])::uuid and c.owner_id = auth.uid()
    )
  );

drop policy "community_images_bucket_delete_owner" on storage.objects;
create policy "community_images_bucket_delete_owner" on storage.objects for delete to authenticated
  using (
    bucket_id = 'community-images'
    and exists (
      select 1 from communities c
      where c.id = ((storage.foldername(storage.objects.name))[1])::uuid and c.owner_id = auth.uid()
    )
  );
