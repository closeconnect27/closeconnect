-- Real gap found while building "most active members" (Branch 3):
-- community_messages_select_group_members (0020) only grants read access
-- via actual group membership (or automatic access to announcement-type
-- groups). A community's owner/moderator isn't necessarily a member of
-- every custom sub-group in their own community, so a message-count
-- query using the caller's own RLS-scoped client would silently
-- undercount activity in any group the caller hasn't personally joined --
-- wrong for an analytics feature that's supposed to reflect the whole
-- community. Purely additive (RLS ORs permissive policies): staff get a
-- second path to read messages in a community they staff, on top of
-- (not instead of) the existing membership-based access.
create policy "community_messages_select_staff_analytics" on community_messages for select to authenticated
  using (
    exists (
      select 1 from community_groups g
      where g.id = community_messages.group_id and is_community_staff(g.community_id)
    )
  );
