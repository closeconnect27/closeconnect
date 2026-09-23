-- A host could publish and sell tickets for events indefinitely without
-- ever adding a payout account -- nothing surfaced this until they tried
-- to check Payments & Payouts themselves. Enforced here (not just in the
-- web createEvent action) because mobile inserts into `events` directly
-- via RLS, with no shared server-side core the way registration/
-- cancellation have one -- a DB trigger is the only place that actually
-- covers both platforms.
--
-- Only gates a host's FIRST event ever (checked before this row exists,
-- so the row being inserted right now doesn't count as their first) --
-- deliberately not "verified", just "has added one" (savePayoutAccountCore
-- already kicks off real Razorpay Fund Account Validation asynchronously;
-- requiring that to complete before creating an event would block on a
-- process the host doesn't control the timing of).
create function public.enforce_first_event_payout_account()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from events where host_id = new.host_id) then
    if not exists (
      select 1 from organizer_payout_accounts
      where organizer_id = new.host_id and is_active = true
    ) then
      raise exception 'Add your payout account (Host Dashboard -> Payments & Payouts) before hosting your first event.';
    end if;
  end if;
  return new;
end;
$$;

create trigger events_require_payout_account_first
  before insert on events
  for each row execute function public.enforce_first_event_payout_account();
