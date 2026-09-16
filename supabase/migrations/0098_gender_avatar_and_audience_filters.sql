-- Gender field (net new -- age already existed via date_of_birth, 0092).
-- Same nullable, no-default shape as date_of_birth: existing rows simply
-- have no gender until a user sets one via profile edit/onboarding.
alter table profiles add column gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say'));

-- Avatar upload -- profiles.avatar_url has existed since day one but has
-- never had an upload path on either platform (a deliberate product
-- decision at the time, now being reversed). Public bucket: avatar_url is
-- read via profiles_select_public (0001_init.sql), which is unrestricted,
-- so gating the underlying file more tightly than the URL that points to
-- it would accomplish nothing.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Path convention {userId}/avatar.ext -- folder keyed to the uploader's own
-- id, same ownership-via-path-prefix pattern as every other bucket in this
-- schema (community-images, event-images, etc).
create policy "avatars_bucket_select_public" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars_bucket_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_bucket_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_bucket_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Audience filters for communities and events (age range + gender), with
-- a per-listing choice of enforcement mode -- some hosts want a hard
-- requirement (e.g. a genuinely women-only space), others just want to
-- signal the intended audience without turning away a borderline request.
-- 'required' mode blocks a non-matching join/registration outright (both
-- app-level and, where the join/registration path allows a direct client
-- insert, via the same RLS check already in place for other fields);
-- 'suggested' just displays the intended audience and enforces nothing.
alter table communities add column min_age int;
alter table communities add column max_age int;
alter table communities add column gender_restriction text check (gender_restriction in ('male', 'female', 'other'));
alter table communities add column audience_enforcement text not null default 'suggested' check (audience_enforcement in ('required', 'suggested'));

alter table events add column min_age int;
alter table events add column max_age int;
alter table events add column gender_restriction text check (gender_restriction in ('male', 'female', 'other'));
alter table events add column audience_enforcement text not null default 'suggested' check (audience_enforcement in ('required', 'suggested'));
