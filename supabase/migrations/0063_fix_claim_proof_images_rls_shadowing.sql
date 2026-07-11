-- Same class of bug as 0026 (community-images), same fix: 0058's
-- claim-proof-images policies wrote `storage.foldername(name)` inside a
-- correlated EXISTS against `communities c` / `claims c`, both of which
-- have their own `name` column (communities) or none at all but sit in
-- the same shadow-prone position -- Postgres's scoping resolves the bare
-- `name` to the correlated table first, not storage.objects.name, so
-- `(communities.name)::uuid` was attempted and threw exactly the reported
-- error ("invalid input syntax for type uuid: <community display name>").
-- Qualify the reference to the outer table explicitly, as 0026 already
-- established.
drop policy "claim_proof_images_bucket_insert_claimable" on storage.objects;
create policy "claim_proof_images_bucket_insert_claimable" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'claim-proof-images'
    and exists (
      select 1 from communities c
      where c.id = ((storage.foldername(storage.objects.name))[1])::uuid
      and c.kind = 'external'
    )
  );

drop policy "claim_proof_images_bucket_select_own_or_admin" on storage.objects;
create policy "claim_proof_images_bucket_select_own_or_admin" on storage.objects for select to authenticated
  using (
    bucket_id = 'claim-proof-images'
    and (
      is_admin()
      or exists (
        select 1 from claims c
        where c.community_id = ((storage.foldername(storage.objects.name))[1])::uuid
        and c.claimant_user_id = auth.uid()
      )
    )
  );
