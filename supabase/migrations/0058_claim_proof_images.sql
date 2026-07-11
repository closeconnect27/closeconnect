-- Claim proof attachments: the claim form only ever had a free-text
-- "proof" field (a link/description), no way to actually attach an image
-- -- the admin reviewing a claim had nothing to look at. Storage paths
-- (not public URLs), same reasoning as chat-attachments (0045): claim
-- proof is private, resolved to a signed URL per-viewer (the claimant or
-- an admin) rather than being publicly fetchable like community/event
-- images.
alter table claims add column proof_image_paths text[];

-- Path convention: {community_id}/{uuid}.ext, same shape as
-- community-images/event-images/chat-attachments. Keyed by community_id
-- rather than the claim's own id since the claim row doesn't exist yet at
-- upload time (the claimant picks images before submitting the form) --
-- same "row doesn't exist yet" situation precreate_description_images
-- (0053) solved for new communities.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('claim-proof-images', 'claim-proof-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Only communities that can actually be claimed (external, not already
-- owned) accept proof uploads -- blocks using this bucket as a general
-- dumping ground under an arbitrary community folder.
create policy "claim_proof_images_bucket_insert_claimable" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'claim-proof-images'
    and exists (
      select 1 from communities c
      where c.id = ((storage.foldername(name))[1])::uuid
      and c.kind = 'external'
    )
  );

-- Select: an admin reviewing any claim, or the claimant who uploaded it
-- viewing their own submission back -- matched by community_id, mirroring
-- claims_select_own_or_admin's own claimant-or-admin shape.
create policy "claim_proof_images_bucket_select_own_or_admin" on storage.objects for select to authenticated
  using (
    bucket_id = 'claim-proof-images'
    and (
      is_admin()
      or exists (
        select 1 from claims c
        where c.community_id = ((storage.foldername(name))[1])::uuid
        and c.claimant_user_id = auth.uid()
      )
    )
  );
