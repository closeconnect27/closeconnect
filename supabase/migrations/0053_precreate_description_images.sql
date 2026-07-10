-- Rich descriptions now allow inline images during CREATION, not just
-- edit -- previously blocked because the community/event row didn't exist
-- yet, so is_community_owner/is_event_host had no row to check ownership
-- against. NewCommunityForm/NewEventForm now generate their own id
-- client-side (crypto.randomUUID()) and upload against it before the row
-- exists, then pass that same id into the create Server Action so the
-- insert lands under it.
--
-- Both policies below add an explicit "the row simply doesn't exist yet"
-- branch alongside the existing ownership check:
--   - pre-creation: any authenticated user can claim an as-yet-unused
--     random UUID folder. Not a meaningful write-anywhere hole -- v4 UUIDs
--     are cryptographically unguessable, so nobody else can target the
--     specific id a real creator is about to use. Worst case is an
--     orphaned upload under an id nobody claims (if the form is
--     abandoned), the same accepted risk as any other orphaned-storage
--     case in this app (see 0047's cleanup notes).
--   - post-creation: falls through to the existing owner/host-only check,
--     unchanged -- only the real owner/host can add more images later.
drop policy "community_images_bucket_insert_owner" on storage.objects;
create policy "community_images_bucket_insert_owner" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'community-images'
    and (
      exists (
        select 1 from communities c
        where c.id = ((storage.foldername(storage.objects.name))[1])::uuid and c.owner_id = auth.uid()
      )
      or not exists (
        select 1 from communities c where c.id = ((storage.foldername(storage.objects.name))[1])::uuid
      )
    )
  );

drop policy "event_images_bucket_insert_host" on storage.objects;
create policy "event_images_bucket_insert_host" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-images'
    and (
      is_event_host(((storage.foldername(name))[1])::uuid)
      or not exists (
        select 1 from events e where e.id = ((storage.foldername(name))[1])::uuid
      )
    )
  );
