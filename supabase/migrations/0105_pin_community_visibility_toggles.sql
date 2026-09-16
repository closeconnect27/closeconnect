-- Found while wiring up mobile's members_list_visible/member_count_visible
-- toggle (feature parity with web's owner-only MembersVisibilityToggle/
-- MemberCountVisibilityToggle): communities_update_owner_or_admin (0095)
-- already pins owner_id/claim_status/join_mode/is_founding, but never
-- pinned these two columns. The app-layer server actions
-- (toggleMembersListVisibility/toggleMemberCountVisibility) do check
-- "owner only" themselves, but that's not the real security boundary here
-- -- is_community_staff(id) in the policy's own `with check` means a
-- moderator could already flip either setting via a direct API call,
-- bypassing that app-layer check entirely (the same class of gap 0104
-- closed for community_posts). Mobile has no server-action layer at all
-- for these writes, so this is the only real gate once mobile's toggle
-- ships. Same fix shape as 0095: an admin may still change these freely;
-- anyone else's write must leave both columns exactly as they already were.
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
      and (owner_id = auth.uid() or members_list_visible = (select c.members_list_visible from communities c where c.id = communities.id))
      and (owner_id = auth.uid() or member_count_visible = (select c.member_count_visible from communities c where c.id = communities.id))
    )
  );
