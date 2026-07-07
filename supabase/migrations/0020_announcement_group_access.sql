-- Verified before changing anything (per the brief's explicit instruction
-- not to assume): the current community_messages_select_group_members
-- policy is `using (is_group_member(group_id))` for every group with no
-- exception for is_announcement, unchanged since 0001_init.sql. That means
-- a community member who never explicitly joined the Announcements
-- sub-group currently has NO read access to it at all -- the wrong model.
-- Announcement-type groups should be readable by every community member
-- automatically, decoupled from community_group_members.
drop policy "community_messages_select_group_members" on community_messages;
create policy "community_messages_select_group_members" on community_messages for select to authenticated
  using (
    is_group_member(group_id)
    or exists (
      select 1 from community_groups g
      where g.id = group_id and g.is_announcement and is_community_member(g.community_id)
    )
  );

-- Second gap found during the same re-read, NOT something the brief assumed
-- correctly: "only posting should stay owner/moderator-gated" was stated as
-- already true, but it wasn't -- community_messages_insert_group_members
-- only ever checked is_group_member(group_id) for every group, announcement
-- or not, and there was no UI gate either (GroupChat's composer has no
-- is_announcement/isStaff check). Any member who joined the Announcements
-- group could already post there. Fixed at the RLS layer (the real gate)
-- and the UI layer (so a non-staff member doesn't see a composer that will
-- just reject them).
drop policy "community_messages_insert_group_members" on community_messages;
create policy "community_messages_insert_group_members" on community_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from community_groups g
        where g.id = group_id and g.is_announcement and is_community_staff(g.community_id)
      )
      or exists (
        select 1 from community_groups g
        where g.id = group_id and not g.is_announcement and is_group_member(group_id)
      )
    )
  );
