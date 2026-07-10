-- The admin reports queue needs to resolve a reported message's content
-- (0001's `reports` table already has target_type='message'), but
-- community_messages' existing read policies only grant access via group
-- membership (0020) or being staff of THAT SPECIFIC community (0039) --
-- neither of which a platform admin necessarily has for an arbitrary
-- reported message in a community they don't belong to. Purely additive
-- (RLS ORs permissive policies), same "second path on top of, not instead
-- of" pattern as 0039.
create policy "community_messages_select_admin" on community_messages for select to authenticated
  using (is_admin());

-- profiles_update_own (0010) is `using (id = auth.uid())` with no admin
-- override at all -- an admin literally cannot update another user's row
-- through the normal RLS-scoped client. Rather than loosening that policy
-- (which would open every column, not just this one, to admin writes), a
-- narrow security-definer function that only ever touches
-- is_founding_host and re-checks is_admin() itself.
create function public.admin_set_founding_host(p_profile_id uuid, p_founding boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Only an admin can do this';
  end if;
  update profiles set is_founding_host = p_founding where id = p_profile_id;
end;
$$;
