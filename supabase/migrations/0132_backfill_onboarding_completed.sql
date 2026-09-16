-- 0092 added onboarding_completed_at with no backfill -- every profile
-- that existed before tonight reads as null, which the middleware (also
-- first deployed tonight) reads as "show the onboarding flow", so every
-- existing user got redirected into a brand-new, never-before-live flow
-- on their very next signed-in page load. Only someone who signs up FROM
-- NOW ON should ever see onboarding -- backfill everyone who already had a
-- profile as already-done, stamped with their own created_at rather than
-- now() so this reads as "completed whenever they originally joined," not
-- "completed tonight."
update profiles set onboarding_completed_at = created_at where onboarding_completed_at is null;
