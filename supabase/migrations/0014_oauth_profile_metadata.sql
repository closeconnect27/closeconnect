-- Populate profiles.display_name / avatar_url from OAuth provider metadata
-- (Google Sign-In, added ahead of the auth-flow switch itself so the data
-- model is ready first) -- falls back through the pre-existing custom
-- 'display_name' field (never actually set by the current magic-link flow,
-- but kept so this stays a strict superset of 0001_init.sql's behavior) and
-- finally the email-prefix, same as before. avatar_url checks both
-- 'avatar_url' and 'picture' since providers aren't consistent about which
-- claim name they populate.
--
-- No RLS changes: every existing policy keys off auth.uid(), which is
-- identical regardless of which provider authenticated the user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  );
  return new;
end;
$$;
