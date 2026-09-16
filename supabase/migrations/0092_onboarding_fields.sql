-- First-time onboarding: username (a real handle, distinct from
-- display_name -- which is just auto-populated from Google/email and was
-- never meant to be a stable identifier, 0014), date of birth, and
-- interests (reusing the already-dead profile_details.interests column
-- from 0033 instead of adding a third unused interests array -- this
-- finally gives it a real writer).
--
-- onboarding_completed_at is the one column every gate checks (middleware,
-- the /onboarding page itself) -- null means "show the flow", set means
-- "never again", regardless of whether username/dob/interests individually
-- look filled in some other way.
alter table profiles add column username text unique;
alter table profiles add column date_of_birth date;
alter table profiles add column onboarding_completed_at timestamptz;

-- Defense in depth beyond the client-side zod check: lowercase
-- alphanumeric + underscore, 3-20 chars. Only enforced when set (existing
-- rows and mid-onboarding nulls are unaffected).
alter table profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

-- profiles_update_own (0001_init.sql, `using/with check (id = auth.uid())`)
-- already covers writes to these new columns -- no new policy needed.
