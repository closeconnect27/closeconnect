-- Security audit finding (high): is_founding (communities) and
-- is_founding_host (profiles) were added in 0054_visibility_and_founding_flags
-- as "admin-curated" trust badges, but neither owner-facing UPDATE policy
-- was ever extended to pin them -- communities_update_owner_or_admin (0017)
-- only pins owner_id/claim_status/join_mode, and profiles_update_own (0010)
-- only pins is_admin. Since both policies otherwise allow a normal
-- owner/self update, any signed-in user could self-grant a "Founding"
-- badge on their own community, or "Founding host" on their own profile,
-- via a plain update through the same anon-key client the app already
-- ships -- completely bypassing admin.tsx's is_admin gate and, for hosts,
-- making the admin_set_founding_host() RPC's own check moot (the RPC was
-- safe in isolation; the underlying column just wasn't).
--
-- Same fix shape as the existing pinned columns on both policies: an
-- admin may still change these freely; anyone else's write must leave the
-- column exactly as it already was.
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
      and is_founding = (select c.is_founding from communities c where c.id = communities.id)
    )
  );

drop policy "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and is_admin = (select p.is_admin from profiles p where p.id = auth.uid())
    and is_founding_host = (select p.is_founding_host from profiles p where p.id = auth.uid())
  );
