-- NOT YET PUSHED -- written for review, per explicit instruction to confirm
-- the scheduling mechanism before it goes live. See the chat response this
-- shipped alongside for the reasoning. Once approved, run the two
-- vault.create_secret calls below with real values (once, by hand -- not
-- safe to commit real secret values to a migration file in git), then push
-- this file normally.
--
-- Mechanism: pg_cron + pg_net, calling the send-event-reminders Edge
-- Function over HTTP every 5 minutes. This is Supabase's own current
-- documented pattern for scheduled Edge Functions -- no third-party cron
-- service, no operational dependency beyond Supabase itself. Confirmed both
-- extensions are available on this project's plan (checked
-- pg_available_extensions directly: present, not yet installed -- unlike
-- storage vector buckets hit earlier this project, this isn't paid-tier
-- gated).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- One-time setup, run by hand with real values before pushing this file:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<anon key>', 'project_anon_key');
-- The anon key is fine to use for the invocation's Authorization header --
-- it's already public in every browser bundle. It's not the same key the
-- function uses internally (that's the service-role key, read from the
-- function's own environment, never from this table).

select cron.schedule(
  'send-event-reminders',
  '*/5 * * * *', -- every 5 minutes
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-event-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'project_anon_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
