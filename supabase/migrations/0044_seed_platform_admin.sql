-- Platform admin account. ADMIN_EMAIL (closeconnect27@gmail.com) has
-- always been where claim/verification notification emails are sent, but
-- that's just an env var read by the mailer -- it never granted the
-- profiles.is_admin flag that actually gates reviewing claims/verification
-- requests in the dashboard. This is a one-time data fix, not a schema
-- change: is_admin already exists (0001_init.sql), this just flips it for
-- the one real account that should have it. A no-op if the account
-- doesn't exist yet in a given environment.
update profiles set is_admin = true
where id = (select id from auth.users where email = 'closeconnect27@gmail.com');
