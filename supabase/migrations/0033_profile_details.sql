-- Member Profiles (Branch 1). New table, not new columns on `profiles` --
-- Postgres RLS is row-level, not column-level: `profiles_select_public`
-- (0001_init.sql) is `using (true)`, and it stays that way here since
-- display_name/avatar_url attribution is relied on everywhere (messages,
-- event hosts, community owners, ratings...). Adding visibility-sensitive
-- columns directly to `profiles` would do nothing -- a second, stricter
-- policy on the same table can't override a permissive `using (true)` one;
-- Postgres ORs permissive policies together. A separate 1:1 table with its
-- own RLS is the only way "private means actually not readable" is real
-- instead of UI-only.
--
-- bio/interests move here too, not just the new fields: they're existing
-- `profiles` columns but (confirmed by grep) never read anywhere in the
-- app, so there's no risk in relocating them to where visibility can
-- actually apply to them per the spec ("showing: bio, occupation/..."). The
-- old profiles.bio/profiles.interests columns are left in place unused
-- rather than dropped -- no destructive schema change for two dead columns.
create table profile_details (
  id uuid primary key references profiles(id) on delete cascade,
  bio text,
  interests text[],
  occupation text,
  company text,
  college text,
  linkedin_url text,
  github_url text,
  instagram_url text,
  skills text[] not null default '{}',
  profile_visibility text not null default 'public' check (profile_visibility in ('public', 'members_only', 'private')),
  updated_at timestamptz default now()
);

alter table profile_details enable row level security;

create policy "profile_details_select" on profile_details for select
  using (
    id = auth.uid()
    or profile_visibility = 'public'
    or (profile_visibility = 'members_only' and auth.uid() is not null)
  );

-- The "judge quality before approving" case: a community's staff reviewing
-- a still-pending join request can see the applicant's full profile
-- regardless of their visibility setting. Scoped tightly to pending
-- requests for a community this caller actually staffs -- once reviewed
-- (approved/rejected) this policy stops granting anything, though the
-- general policy above may still apply if the profile is public/members_only.
create policy "profile_details_select_staff_reviewing" on profile_details for select
  using (
    exists (
      select 1 from form_responses fr
      where fr.owner_type = 'community'
        and fr.respondent_id = profile_details.id
        and fr.status = 'pending'
        and is_community_staff(fr.owner_id)
    )
  );

create policy "profile_details_insert_own" on profile_details for insert to authenticated
  with check (id = auth.uid());
create policy "profile_details_update_own" on profile_details for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Every profile gets a details row from signup on, so "no row visible" via
-- RLS reliably means "not permitted to see it", never "doesn't exist yet".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  insert into public.profile_details (id) values (new.id);
  return new;
end;
$$;

-- Backfill for accounts that already existed before this migration.
insert into profile_details (id)
select id from profiles
where id not in (select id from profile_details);

-- "Events attended" on a public profile needs to work for viewers who are
-- neither the respondent nor the event host -- form_responses'
-- own RLS (0001_init.sql, owner_or_respondent) doesn't allow that read at
-- all. This is a second, additive permissive policy (RLS ORs them), scoped
-- narrowly: only approved event responses, only once the event has passed,
-- and only when the respondent's own profile_details visibility permits
-- this viewer -- never widens access to pending/rejected responses or to a
-- private profile's history.
create policy "form_responses_select_public_event_attendance" on form_responses for select
  using (
    owner_type = 'event'
    and status = 'approved'
    and exists (
      select 1 from events e where e.id = form_responses.owner_id and e.event_date < current_date
    )
    and exists (
      select 1 from profile_details pd
      where pd.id = form_responses.respondent_id
        and (pd.profile_visibility = 'public' or (pd.profile_visibility = 'members_only' and auth.uid() is not null))
    )
  );
