-- Community editing (separate from creation, which is all that existed
-- before): logo_url is new, distinct from the existing cover_image_url --
-- logo is small/square (shown as an avatar), cover is wide/hero.
alter table communities add column logo_url text;

-- Same defense-in-depth pattern as owner_id in 0010_security_hardening.sql:
-- the edit Server Action already restricts editable fields to
-- name/description/logo_url/cover_image_url/category/extra_categories/city
-- and checks auth.uid() = owner_id before writing, but RLS shouldn't rely on
-- the Server Action alone -- a direct API call using the owner's own valid
-- session could otherwise still flip claim_status or join_mode, neither of
-- which the app ever intends to expose as editable (join_mode especially:
-- changing it after members already exist under the old mode is a real
-- product risk, not just an oversight).
drop policy "communities_update_owner_or_admin" on communities;
create policy "communities_update_owner_or_admin" on communities for update to authenticated
  using (owner_id = auth.uid() or is_community_staff(id) or is_admin())
  with check (
    is_admin()
    or (
      (owner_id = auth.uid() or is_community_staff(id))
      and owner_id = (select c.owner_id from communities c where c.id = communities.id)
      and claim_status = (select c.claim_status from communities c where c.id = communities.id)
      and join_mode = (select c.join_mode from communities c where c.id = communities.id)
    )
  );
