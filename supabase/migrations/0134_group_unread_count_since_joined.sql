-- get_group_unread_count (0075) fell back to 'epoch'::timestamptz for a
-- member who's never explicitly marked the group read yet -- meaning a
-- brand new member joining an active group saw the group's ENTIRE message
-- history counted as unread, not just what arrived after they joined.
-- Falls back to their own community_group_members.joined_at instead.
create or replace function public.get_group_unread_count(p_group_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select case when is_group_member(p_group_id) then (
    select count(*) from community_messages
    where group_id = p_group_id
      and user_id != auth.uid()
      and created_at > coalesce(
        (select last_read_at from community_group_reads where group_id = p_group_id and user_id = auth.uid()),
        (select joined_at from community_group_members where group_id = p_group_id and user_id = auth.uid()),
        'epoch'::timestamptz
      )
  ) else 0 end;
$$;
