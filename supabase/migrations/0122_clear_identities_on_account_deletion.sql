-- Real bug found live: deleteAccountById (src/lib/accountDeletion.ts) bans
-- the auth user and randomizes auth.users.email, but a user who originally
-- signed up via Google (or any OAuth provider) has a SEPARATE row in
-- auth.identities whose own identity_data.email still holds the real
-- email address -- updateUserById never touches it, and GoTrue's admin API
-- has no endpoint to remove an identity (confirmed: DELETE /admin/users/
-- {id}/identities/{identity_id} 404s on this project's GoTrue version).
-- Effect: after "deleting" their account, the person could never sign up
-- again with that same email or Google account -- signInWithOtp/Google
-- sign-in both resolve the email to the still-existing (now banned)
-- identity and return "user is banned" instead of creating a fresh
-- account, exactly the opposite of what account deletion should allow.
--
-- Fixed by clearing every identity row for the deleted user directly --
-- something only reachable via a migration's elevated privileges, not the
-- Admin API. service_role only: this reaches into auth.identities, not
-- something any authenticated user should ever be able to trigger for
-- another id.
create function public.clear_user_identities(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from auth.identities where user_id = p_user_id;
end;
$$;
revoke execute on function public.clear_user_identities(uuid) from public, authenticated, anon;
grant execute on function public.clear_user_identities(uuid) to service_role;
