-- Fires a push notification for every notification row, regardless of which
-- of the ~15 code paths created it (4 direct inserts in src/app/actions and
-- src/app/api/webhooks/razorpay, the rest via existing security-definer
-- triggers like notify_new_follower) -- one hook here covers all of them
-- with no app-code changes. Mirrors 0023_schedule_event_reminders.sql's
-- pg_net + vault.decrypted_secrets pattern, event-driven via a row trigger
-- instead of cron.schedule's polling.
--
-- Unlike send-event-reminders (POSTs an empty body, driven purely by DB
-- state), this POSTs attacker-shapeable-looking fields (title/body/link)
-- for a specific user_id -- reusing the public anon key as bearer auth here
-- (as 0023 does) would let anyone who has that key call this function
-- directly and push arbitrary phishing content to any user. So this uses
-- its own single-purpose secret instead, known only to this trigger and the
-- edge function (set once, by hand, same non-committed-value convention as
-- 0023's vault.create_secret calls -- this one's value has no external
-- source, it's simply generated random):
--   select vault.create_secret('<64-hex-char random value>', 'push_trigger_secret');
-- then `supabase secrets set PUSH_TRIGGER_SECRET=<same value>` so the edge
-- function can check it on every invocation.
create or replace function public.trigger_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_trigger_secret')
    ),
    body := jsonb_build_object(
      'user_id', new.user_id,
      'title', new.title,
      'body', new.body,
      'link', new.link,
      'type', new.type
    )
  );
  return new;
end;
$$;

create trigger notifications_push_trigger
  after insert on notifications
  for each row execute function public.trigger_push_notification();
