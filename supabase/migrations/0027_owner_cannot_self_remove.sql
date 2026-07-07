-- Regression sweep finding: community_members_delete_self_or_staff already
-- blocks staff from removing the owner's row (role <> 'owner' on that
-- branch, migration 0010), but the unconditional `user_id = auth.uid()`
-- branch still let an owner delete their OWN row directly -- there's no
-- "leave"/ownership-transfer flow anywhere in the app that legitimately
-- needs this, and removeMember()'s app-level self-removal guard only
-- covers the "Remove" button path, not a direct API call. Once gone, the
-- owner keeps communities.owner_id (still shown as owner, still able to
-- edit) but loses is_community_staff() -- unable to moderate their own
-- community, remove members, or manage groups. Closing the same gap at
-- the RLS layer that already exists for the staff branch.
drop policy "community_members_delete_self_or_staff" on community_members;
create policy "community_members_delete_self_or_staff" on community_members for delete to authenticated
  using (
    (user_id = auth.uid() and role <> 'owner')
    or is_admin()
    or (
      is_community_staff(community_id)
      and role <> 'owner'
    )
  );
